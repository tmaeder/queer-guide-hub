#!/usr/bin/env python3
"""Run the real Jev migrations and transaction refusal/rollback tests in isolated PostgreSQL."""
import os, subprocess, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BIN','/opt/homebrew/opt/postgresql@17/bin'))
schema="""
create role anon;create role authenticated;create role service_role;
create schema api_private;create schema auth;create schema cron;
create function auth.uid()returns uuid language sql as $$select null::uuid$$;
create function auth.jwt()returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
create function cron.schedule(text,text,text)returns bigint language sql as $$select 1::bigint$$;
create table admin_review_cases(id uuid primary key,fingerprint text,active boolean,item jsonb,members jsonb,created_at timestamptz default now(),family text,stage text default 'ready',case_key text,required_role text,updated_at timestamptz default now(),source_keys text[]);
create table admin_review_sources(queue_key text,view_name text,lock_table text,active boolean default true);
create table admin_review_research_jobs(case_id uuid,fingerprint text,outcome jsonb,status text,attempts integer,last_attempt_at timestamptz,next_attempt_at timestamptz);
create table admin_automations(slug text primary key,name text,description text,managed_by text,enabled boolean,trigger jsonb,schedule text,action jsonb,lifecycle_state text);
create table admin_review_decisions(queue_key text,item_id uuid,actor_id uuid not null,decision text,notes text);
create table entity_review_queue(id uuid,entity_type text,entity_id uuid,field text,proposed_value jsonb,confidence numeric,citations jsonb,status text);
create table review_field_registry(entity_type text,field text,active boolean);
create table events(id uuid primary key,title text,description text,event_type text,field_provenance jsonb default '{}',source_url text,city_id uuid,country_id uuid,venue_id uuid,venue_name text);
create table cities(id uuid,name text);create table countries(id uuid,name text);
create table event_sources(id uuid,source_url text,payload jsonb,event_id uuid);
create table event_quality_issues(id uuid primary key,event_id uuid,issue_code text,status text default 'open');
create view triage_test as select id from event_quality_issues where status='open';
create function public._review_risk_blocked(text,text,uuid)returns boolean language sql as $$select false$$;
create function public.has_role_jwt(text)returns boolean language sql as $$select false$$;
create function public.decide_event_quality_issue(uuid,text,text)returns void language sql as $$update public.event_quality_issues set status=$2 where id=$1$$;
create function public.reconcile_admin_review_cases(text,uuid[])returns void language sql as $$select null::void$$;
insert into admin_review_sources values('event-quality','triage_test','event_quality_issues',true);
insert into events(id,title,description,event_type,field_provenance,source_url)values(md5('event')::uuid,'Example game night','Board games','other','{}','https://example.com/event');
insert into event_quality_issues values(md5('issue')::uuid,md5('event')::uuid,'CATEGORY_UNRESOLVED','open');
insert into admin_review_cases(id,fingerprint,active,item,members,created_at,family,stage)values(md5('case')::uuid,'fingerprint',true,jsonb_build_object('id',md5('issue')::uuid,'queue_type','event-quality','title','Example game night','entity_id',md5('event')::uuid,'entity_table','events','risk','integrity','meta',jsonb_build_object('issue_code','CATEGORY_UNRESOLVED')),'[]',now(),'record','ready');
"""
checks="""
update admin_automations set enabled=true where slug='review_jev';
create temp table claim as select public.claim_jev_review_jobs(1)j;
create temp table ctx as select public.get_jev_review_context(md5('case')::uuid,(j->0->>'lease_token')::uuid)c from claim;
create temp table result as select jsonb_build_object('evaluation',jsonb_build_object('model','jev-test','answers',jsonb_build_object(
'decision',jsonb_build_object('type','choice','choice','category_social','confidence',1,'probabilities',jsonb_build_object('category_social',1)),
'support_category_social',jsonb_build_object('type','choice','choice','supported','confidence',1,'probabilities',jsonb_build_object('supported',1)),
'support',jsonb_build_object('type','choice','choice','supported','confidence',1,'probabilities',jsonb_build_object('supported',1)),
'risk',jsonb_build_object('type','choice','choice','routine','confidence',1,'probabilities',jsonb_build_object('routine',1)))))r;
create temp table evidence as select jsonb_build_array(jsonb_build_object('url','https://example.com/event','retrieved_at',now(),'text',repeat('Verified board game event source ',10)))e;
do $$declare r jsonb;begin
 r:=public.finish_jev_review_job(md5('case')::uuid,(select(j->0->>'lease_token')::uuid from claim),(select c->>'input_hash'from ctx),(select result.r from result),(select e from evidence),true);
 if r->>'status'<>'preview' or exists(select 1 from events where event_type<>'other')or exists(select 1 from admin_review_automation_audit)then raise exception 'Dry run wrote: %',r;end if;
end $$;
update admin_review_automation_jobs set next_attempt_at=now();
update claim set j=public.claim_jev_review_jobs(1);
update ctx set c=public.get_jev_review_context(md5('case')::uuid,(select(j->0->>'lease_token')::uuid from claim));
update events set description='Changed source';
do $$declare r jsonb;begin
 r:=public.finish_jev_review_job(md5('case')::uuid,(select(j->0->>'lease_token')::uuid from claim),(select c->>'input_hash'from ctx),(select result.r from result),(select e from evidence),false);
 if r->>'status'<>'stale' or exists(select 1 from events where event_type<>'other')then raise exception 'Stale wrote: %',r;end if;
end $$;
update claim set j=public.claim_jev_review_jobs(1);
update ctx set c=public.get_jev_review_context(md5('case')::uuid,(select(j->0->>'lease_token')::uuid from claim));
do $$declare r jsonb;begin
 r:=public.finish_jev_review_job(md5('case')::uuid,(select(j->0->>'lease_token')::uuid from claim),(select c->>'input_hash'from ctx),(select result.r from result),(select e from evidence),false);
 if r->>'status'<>'applied' or not exists(select 1 from events where event_type='social')or(select count(*)from admin_review_automation_audit)<>1 or exists(select 1 from admin_review_decisions where actor_id is not null or actor_kind<>'automation')then raise exception 'Apply/audit failed: %',r;end if;
 r:=public.finish_jev_review_job(md5('case')::uuid,(select(j->0->>'lease_token')::uuid from claim),(select c->>'input_hash'from ctx),(select result.r from result),(select e from evidence),false);
 if r->>'status'<>'stale' or(select count(*)from admin_review_automation_audit)<>1 then raise exception 'Duplicate application';end if;
end $$;

-- Roll back a mutation if its source workflow fails to remove pending membership.
update admin_review_cases set active=true,members='[]',fingerprint='rollback-test'where id=md5('case')::uuid;
update event_quality_issues set status='open';update events set event_type='other';
update admin_review_automation_jobs set status='queued',next_attempt_at=now();
create or replace function public.decide_event_quality_issue(uuid,text,text)returns void language sql as $$select null::void$$;
update claim set j=public.claim_jev_review_jobs(1);
update ctx set c=public.get_jev_review_context(md5('case')::uuid,(select(j->0->>'lease_token')::uuid from claim));
do $$declare r jsonb;begin
 r:=public.finish_jev_review_job(md5('case')::uuid,(select(j->0->>'lease_token')::uuid from claim),(select c->>'input_hash'from ctx),(select result.r from result),(select e from evidence),false);
 if r->>'status'<>'blocked'or exists(select 1 from events where event_type<>'other')or(select count(*)from admin_review_automation_audit)<>1 then raise exception 'Application failure did not roll back: %',r;end if;
end $$;
-- Pausing between claim and execution must refuse a previously authorized candidate.
update admin_review_automation_jobs set next_attempt_at=now();
update claim set j=public.claim_jev_review_jobs(1);
update ctx set c=public.get_jev_review_context(md5('case')::uuid,(select(j->0->>'lease_token')::uuid from claim));
update admin_automations set enabled=false;
do $$declare r jsonb;begin
 r:=public.finish_jev_review_job(md5('case')::uuid,(select(j->0->>'lease_token')::uuid from claim),(select c->>'input_hash'from ctx),(select result.r from result),(select e from evidence),false);
 if r->>'status'<>'paused'or exists(select 1 from events where event_type<>'other')then raise exception 'Pause failed: %',r;end if;
end $$;

-- Protected/private contexts never export their payload; targeted claims respect pause and leases.
update admin_review_cases set item=item||jsonb_build_object('queue_type','group-requests','meta',jsonb_build_object('private_note','DO_NOT_EXPORT'));
do $$declare r jsonb;begin
 r:=api_private.jev_context(md5('case')::uuid);
 if r->>'blocker'<>'private_consent_or_moderation'or r::text like '%DO_NOT_EXPORT%'then raise exception 'Private payload escaped: %',r;end if;
 if public.claim_jev_review_job(md5('case')::uuid)<>'[]'then raise exception 'Targeted retry ignored pause';end if;
end $$;
update admin_automations set enabled=true;
do $$begin
 if jsonb_array_length(public.claim_jev_review_job(md5('case')::uuid))<>1 then raise exception 'Targeted retry failed';end if;
 if public.claim_jev_review_job(md5('case')::uuid)<>'[]'then raise exception 'Targeted retry stole a live lease';end if;
end $$;
-- Deny public invocations even with otherwise valid arguments.
set role authenticated;
do $$begin
 perform public.claim_jev_review_jobs(1);raise exception 'Authenticated accessed service function';
 exception when insufficient_privilege then null;end $$;
reset role;
"""
projection_checks="""
-- Projection must ignore non-object values without exporting scalar/array payloads.
do $$declare value jsonb; projected jsonb;begin
 foreach value in array array[null::jsonb,'null'::jsonb,'"DO_NOT_EXPORT"'::jsonb,'42'::jsonb,'true'::jsonb,'[{"email":"DO_NOT_EXPORT"}]'::jsonb]loop
  projected:=api_private.jev_public_record(value);
  if projected is not null then raise exception 'Non-object projection escaped: %',projected;end if;
 end loop;
 projected:=api_private.jev_public_record(jsonb_build_object('name','Public name','description',repeat('x',19000),'email','DO_NOT_EXPORT','reporter_id','DO_NOT_EXPORT','raw_data',jsonb_build_object('private','DO_NOT_EXPORT')));
 if projected->>'name' is distinct from 'Public name' or length(projected->>'description') is distinct from 18000 or projected::text like '%DO_NOT_EXPORT%'then
  raise exception 'Object projection changed its public allow-list or bounds: %',projected;
 end if;
end $$;

-- Production shape: normalized_data is an object, enriched_data is SQL NULL.
-- to_jsonb(row) represents that column as JSON null inside the staging context.
create table ingestion_staging(id uuid primary key,normalized_data jsonb,enriched_data jsonb,raw_data jsonb,review_status text default 'pending');
create function api_private.review_news_machine_outcome(jsonb)returns text language sql as $$select 'review'::text$$;
create view triage_staging_test as select id from ingestion_staging where review_status='pending';
insert into admin_review_sources values('staging','triage_staging_test','ingestion_staging',true);
insert into ingestion_staging(id,normalized_data,enriched_data,raw_data)values(md5('staging-source')::uuid,
 jsonb_build_object('title','Public staging event','description','Public source description','email','DO_NOT_EXPORT'),null,
 jsonb_build_object('private_note','DO_NOT_EXPORT'));
insert into admin_review_cases(id,fingerprint,active,item,members,family,stage)values(md5('staging-case')::uuid,'staging-fingerprint',true,
 jsonb_build_object('id',md5('staging-source')::uuid,'queue_type','staging','title','Public staging event','entity_table','news_articles','risk','integrity'),'[]','staging','research');
do $$declare ctx jsonb;begin
 ctx:=api_private.jev_context(md5('staging-case')::uuid);
 if ctx#>>'{proposal,source_content,normalized,title}' is distinct from 'Public staging event'
 or ctx#>'{proposal,source_content,enriched}' is distinct from 'null'::jsonb
 or nullif(ctx->>'input_hash','')is null or ctx::text like '%DO_NOT_EXPORT%'then
  raise exception 'Nullable staging projection failed: %',ctx;
 end if;
end $$;
"""
with tempfile.TemporaryDirectory(prefix='jev-review-pg-')as tmp:
 data=Path(tmp)/'data';sock=Path(tmp)/'sock';sock.mkdir()
 subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'pg.log'),'-o',f'-k {sock} -p 55439 -h ""','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:
  sql=schema+(ROOT/'supabase/migrations/99991793212707_jev_review_automation.sql').read_text()+(ROOT/'supabase/migrations/99991793212905_jev_review_runtime_guards.sql').read_text()+(ROOT/'supabase/migrations/99991793213334_jev_proposal_integrity_decisions.sql').read_text()+(ROOT/'supabase/migrations/99991793213540_jev_review_targeted_retry.sql').read_text()+(ROOT/'supabase/migrations/99991793213979_jev_review_operational_visibility.sql').read_text()+(ROOT/'supabase/migrations/99991793222393_jev_research_projection_json_shapes.sql').read_text()+checks+projection_checks
  subprocess.run([str(PG/'psql'),'-X','-v','ON_ERROR_STOP=1','-h',str(sock),'-p','55439','postgres'],input=sql,text=True,check=True,stdout=subprocess.DEVNULL)
 finally:subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: migration, source-backed apply, dry run, stale source refusal, duplicate refusal, atomic rollback, pause, machine audit, service permissions, JSON shape/privacy projection, nullable staging context')
