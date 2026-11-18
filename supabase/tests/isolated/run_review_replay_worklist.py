#!/usr/bin/env python3
"""Exercise real audited replay proof/refusal behavior before and after worklist caching."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
M=ROOT/'supabase/migrations'
source=(M/'99991794088775_review_audited_publisher_replays.sql').read_text()
native=re.search(r'create function api_private.reconcile_audited_publisher_replays[\s\S]*?end \$function\$;',source)
if native is None:
    native=re.search(r'create function api_private.reconcile_audited_publisher_replays[\s\S]*?end \$\$;',source)
native=native.group()
patch=next(M.glob('*_cache_review_replay_worklist.sql')).read_text()
schema=r"""
create role anon;create role authenticated;create role service_role;
create schema api_private;create schema auth;
create function auth.uid()returns uuid language sql as 'select null::uuid';
create function assert_admin_or_internal()returns void language sql as 'select';
create table admin_automations(slug text,enabled boolean);
insert into admin_automations values('review_automatic_resolution',true);
create table ingestion_staging(id uuid primary key,source_name text,source_entity_id text,source_type text,target_table text,created_at timestamptz,updated_at timestamptz,processed_at timestamptz,reviewed_at timestamptz,reviewed_by uuid,disposition text,review_status text,review_notes text,raw_data jsonb,normalized_data jsonb,enriched_data jsonb,target_record_id uuid,dedup_details jsonb,dedup_status text,dedup_match_id uuid);
create table admin_review_cases(id uuid primary key,active boolean,item jsonb);
create table admin_review_automation_jobs(case_id uuid,status text,lease_expires_at timestamptz);
create table content_revisions(source_table text,source_id uuid,actor_kind text);
create table admin_review_repairs(entity_type text,entity_id uuid,reason text,previous_value jsonb,next_value jsonb);
insert into ingestion_staging
select md5(g||'-'||kind)::uuid,'eventfrog','source-'||g,'publisher','events',
 case kind when 'prior'then now()-interval '5 days'when 'seed'then now()-interval '3 days'else now()-interval '1 day'end,
 now()-interval '4 days',now()-interval '2 days',
 case when kind='prior'then now()-interval '4 days'else null end,null,
 case when kind='candidate'then 'pending'else 'rejected'end,
 case when kind='candidate'then 'pending_review'else 'rejected'end,
 case when kind='candidate'then null else 'Original rejection'end,
 jsonb_build_object('source',g),jsonb_build_object('normalized',g),null,null,'{}','pending',null
from generate_series(1,9)g cross join unnest(array['prior','seed','candidate'])kind;
insert into admin_review_cases select md5('case-'||g)::uuid,true,jsonb_build_object('queue_type','staging','id',md5(g||'-candidate')::uuid)from generate_series(1,9)g;
insert into admin_review_repairs
select 'ingestion_staging',s.id,'previously_reviewed_publisher_replay:v1',null,
 to_jsonb(s)||jsonb_build_object('dedup_details',jsonb_build_object('reviewed_source_replay',jsonb_build_object('prior_staging_id',md5(g||'-prior')::uuid)))
from generate_series(1,9)g join ingestion_staging s on s.id=md5(g||'-seed')::uuid;
insert into content_revisions values('ingestion_staging',md5('2-candidate')::uuid,'human');
update ingestion_staging set dedup_details='{"manual_hold":true}'where id=md5('3-candidate')::uuid;
insert into ingestion_staging select md5('4-later')::uuid,source_name,source_entity_id,source_type,target_table,created_at,now(),processed_at,reviewed_at,reviewed_by,'inserted','approved',review_notes,raw_data,normalized_data,enriched_data,md5('record')::uuid,dedup_details,dedup_status,dedup_match_id from ingestion_staging where id=md5('4-candidate')::uuid;
insert into admin_review_automation_jobs values(md5('case-5')::uuid,'running',now()+interval '1 hour');
update ingestion_staging set normalized_data='{"changed":true}'where id=md5('6-candidate')::uuid;
update admin_review_cases set active=false where id=md5('case-7')::uuid;
update ingestion_staging set review_notes='Changed seed review'where id=md5('8-seed')::uuid;
update ingestion_staging set source_name='unsupported'where source_entity_id='source-9';
create table before_stages as select id,to_jsonb(s)value from ingestion_staging s;
"""
before=r"""
revoke all on function api_private.reconcile_audited_publisher_replays(integer,boolean)from public;
grant execute on function api_private.reconcile_audited_publisher_replays(integer,boolean)to service_role;
create table security_before as select oid,proowner,proacl,proconfig,prosecdef from pg_proc where oid='api_private.reconcile_audited_publisher_replays(integer,boolean)'::regprocedure;
create table baseline as select api_private.reconcile_audited_publisher_replays(100,true) result;
do $$begin if(select result->>'rejected_replays'from baseline)<>'1'then raise exception 'Original fixture does not isolate one proven replay';end if;end$$;
"""
checks=r"""
do $$declare r jsonb;begin
r:=api_private.reconcile_audited_publisher_replays(100,true);
if r is distinct from(select result from baseline)then raise exception 'Candidate semantics changed: %',r;end if;
if exists(select 1 from before_stages b join ingestion_staging s using(id)where b.value<>to_jsonb(s))then raise exception 'Dry run wrote';end if;
update admin_automations set enabled=false;
if api_private.reconcile_audited_publisher_replays(100,false)->>'skipped'<>'paused'then raise exception 'Pause ignored';end if;
update admin_automations set enabled=true;
if api_private.reconcile_audited_publisher_replays(0,false)->>'rejected_replays'<>'0'then raise exception 'Zero bound ignored';end if;
r:=api_private.reconcile_audited_publisher_replays(1,false);
if r->>'rejected_replays'<>'1'or(select disposition from ingestion_staging where id=md5('1-candidate')::uuid)<>'rejected'then raise exception 'Proven replay not rejected';end if;
if exists(select 1 from before_stages b join ingestion_staging s using(id)where b.id<>md5('1-candidate')::uuid and b.value<>to_jsonb(s))then raise exception 'Human/hold/lease/version/publication/worklist/source guard changed';end if;
if api_private.reconcile_audited_publisher_replays(100,false)->>'rejected_replays'<>'0'then raise exception 'Repeat not idempotent';end if;
if exists(select 1 from security_before b join pg_proc p on p.oid=b.oid where row(p.proowner,p.proacl,p.proconfig,p.prosecdef)is distinct from row(b.proowner,b.proacl,b.proconfig,b.prosecdef))then raise exception 'Function security changed';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix='qg-replay-cache-')as tmp:
    data=str(Path(tmp)/'data')
    subprocess.run([str(PG/'initdb'),'-D',data,'-A','trust','--no-locale','--encoding=UTF8'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(PG/'pg_ctl'),'-D',data,'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55494 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
    try:
        r=subprocess.run([str(PG/'psql'),'-X','-h',tmp,'-p','55494','-d','postgres','-v','ON_ERROR_STOP=1'],input=schema+native+before+patch+patch+checks,text=True,capture_output=True)
        if r.returncode:raise RuntimeError(r.stderr)
    finally:
        subprocess.run([str(PG/'pg_ctl'),'-D',data,'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: original replay candidates unchanged; human, hold, lease, version, publication, worklist and source gates; bounds, pause/dry/repeat, security and idempotence preserved')
