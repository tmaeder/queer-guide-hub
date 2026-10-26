#!/usr/bin/env python3
"""Exercise the real migration in a disposable PostgreSQL cluster."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get('PG_BINDIR', '/opt/homebrew/opt/postgresql@17/bin'))
schema = """
create role anon;create role authenticated;create role service_role;
create schema api_private;create schema auth;
create function auth.uid()returns uuid language sql as 'select null::uuid';
create function assert_admin_or_internal()returns void language sql as 'select';
create table countries(id uuid primary key,code text);
create table cities(id uuid primary key,country_id uuid,duplicate_of_id uuid);
create table venues(id uuid primary key,city_id uuid,country_id uuid,duplicate_of_id uuid);
create table events(id uuid primary key,title text,description text,start_date timestamptz,external_id text,
 data_source text,venue_id uuid,city_id uuid,country_id uuid,duplicate_of_id uuid,
 is_recurring boolean default false,series_key text);
create table event_sources(id uuid primary key,event_id uuid,source_slug text,source_entity_id text,source_url text,payload_hash text,payload jsonb);
create table event_quality_issues(id uuid primary key,event_id uuid,status text default 'open',detector text default 'event-quality-scan',issue_code text default 'DESCRIPTION_REUSED',
 reviewed_by uuid,reviewed_at timestamptz,resolved_at timestamptz,resolution text,evidence jsonb default '{"original":"do not replace"}');
create table event_quality_current(event_id uuid primary key,open_issue_codes text[],issue_codes text[]);
create table admin_review_repairs(entity_type text,entity_id uuid,reason text,previous_value jsonb,next_value jsonb);
create table admin_automations(slug text,enabled boolean);
insert into admin_automations values('review_automatic_resolution',true);
create function event_quality_description_fingerprint(text)returns text language sql immutable as 'select md5($1)';
create function event_quality_findings(p_event_id uuid)returns table(issue_code text)language sql set search_path=public as $body$
 with e as(select *,10 description_reuse_count from events where id=p_event_id)
 select 'DESCRIPTION_REUSED' from e where coalesce(description_reuse_count,0)>=10 and coalesce(is_recurring,false)=false and series_key is null
$body$;
create function api_private.run_review_automatic_resolution(p_batch integer,p_dry_run boolean)returns jsonb language plpgsql as $body$
declare v_limit integer:=p_batch;
begin
 return jsonb_build_object('dry_run',p_dry_run,'existing_result',true);
end $body$;
insert into countries values(md5('DE')::uuid,'DE'),(md5('FR')::uuid,'FR');
insert into cities values(md5('city')::uuid,md5('DE')::uuid,null);
insert into venues values(md5('venue')::uuid,md5('city')::uuid,md5('DE')::uuid,null);
-- Distinct description clusters isolate every negative source boundary.
insert into events(id,title,description,start_date,external_id,data_source,venue_id,city_id,country_id)
 select md5(g||':'||d)::uuid,'Program '||g,'Complete source copy '||g,
  ('2026-10-01 15:00+00'::timestamptz+make_interval(days=>d)),
  'mix/program-'||g||'/'||to_char(('2026-10-01 15:00+00'::timestamptz+make_interval(days=>d)) at time zone 'Europe/Berlin','YYYY-MM-DD/HH24:MI'),
  'siegessaeule',md5('venue')::uuid,md5('city')::uuid,md5('DE')::uuid
 from generate_series(1,15)g cross join generate_series(1,3)d;
insert into event_sources
 select e.id,e.id,'siegessaeule',e.external_id,'https://www.siegessaeule.de/termine/'||e.external_id||'/',repeat('a',64),
  jsonb_build_object('raw',jsonb_build_object('source','siegessaeule','url','https://www.siegessaeule.de/termine/'||e.external_id||'/'),
   'normalized',jsonb_build_object('sourceId',e.external_id,'title',e.title,'description',e.description,'start_date',e.start_date,
    'location',jsonb_build_object('country','DE','timezone','Europe/Berlin'),
    'metadata',jsonb_build_object('series',split_part(e.external_id,'/',1)||'/'||split_part(e.external_id,'/',2),
     'source','siegessaeule','url','https://www.siegessaeule.de/termine/'||e.external_id||'/')))from events e;
-- A single bad sibling must keep its entire reuse cluster under review.
update event_sources set source_slug='unrelated'where id=md5('2:1')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,title}','"Other program"')where id=md5('3:1')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,start_date}','"2026-10-02T17:30:00+02:00"')where id=md5('4:1')::uuid;
update event_sources set payload_hash='bad'where id=md5('5:1')::uuid;
update events set country_id=md5('FR')::uuid where id=md5('6:1')::uuid;
update events set venue_id=null where id=md5('7:1')::uuid;
update event_sources set source_url='https://untrusted.example/termine/'where id=md5('8:1')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,description}','"Different captured copy"')where id=md5('9:1')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,metadata,series}','"mix/other-program"')where id=md5('10:1')::uuid;
delete from event_sources where id=md5('11:1')::uuid;
-- A NULL fact cannot be ignored by bool_and and accidentally approve the cluster.
update events set title=null where id=md5('12:1')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,location,timezone}','"UTC"')where id=md5('13:1')::uuid;
-- Only two distinct current instants, even though there are three rows.
delete from events where id=md5('14:3')::uuid;
-- German DST ends 2026-10-25: URL uses Berlin local time, not UTC.
update events set start_date='2026-10-25T15:00:00Z',external_id='mix/program-15/2026-10-25/16:00'where id=md5('15:1')::uuid;
update event_sources s set source_entity_id=e.external_id,source_url='https://www.siegessaeule.de/termine/'||e.external_id||'/',
 payload=jsonb_set(jsonb_set(jsonb_set(jsonb_set(payload,'{normalized,start_date}',to_jsonb(e.start_date)),
 '{normalized,sourceId}',to_jsonb(e.external_id)),'{normalized,metadata,url}',to_jsonb('https://www.siegessaeule.de/termine/'||e.external_id||'/')),
 '{raw,url}',to_jsonb('https://www.siegessaeule.de/termine/'||e.external_id||'/'))from events e where e.id=s.id and e.id=md5('15:1')::uuid;
insert into event_quality_issues(id,event_id)select id,id from events;
update event_quality_issues set reviewed_at=now()where id=md5('1:1')::uuid;
update event_quality_issues set detector='external-detector'where id=md5('1:2')::uuid;
insert into event_quality_current select id,array['DESCRIPTION_REUSED','KEEP_OTHER'],array['DESCRIPTION_REUSED','KEEP_OTHER']from events;
create table original_events as select id,to_jsonb(e)value from events e;
create table original_sources as select id,to_jsonb(s)value from event_sources s;
-- Disallow even an attempted event mutation by the resolver.
create function forbid_event_write()returns trigger language plpgsql as 'begin raise exception ''Unexpected event mutation'';end';
create trigger no_event_write before update or delete on events for each row execute function forbid_event_write();
"""
paths = list((ROOT/'supabase/migrations').glob('*_event_quality_publisher_occurrence_copy.sql'))
assert len(paths)==1
checks = """
do $check$
declare result jsonb;
begin
 if not api_private.event_description_reuse_expected(md5('1:3')::uuid)
  or not api_private.event_description_reuse_expected(md5('15:1')::uuid)then raise exception 'Expected publisher series not recognized';end if;
 if exists(select 1 from events where title not in('Program 1','Program 15')and api_private.event_description_reuse_expected(id))then raise exception 'Source contradiction was accepted';end if;
 result:=api_private.run_review_automatic_resolution(200,true);
 if result->>'publisher_description_findings'<>'4' or exists(select 1 from admin_review_repairs)then raise exception 'Dry run changed data or count: %',result;end if;
 update admin_automations set enabled=false;
 result:=api_private.reconcile_publisher_event_copy(200,false);
 if result->>'publisher_copy_skipped'<>'paused' or exists(select 1 from admin_review_repairs)then raise exception 'Pause ignored';end if;
 update admin_automations set enabled=true;
 result:=api_private.run_review_automatic_resolution(200,false);
 if result->>'publisher_description_findings'<>'4' or result->>'existing_result'<>'true'then raise exception 'Integration failed %',result;end if;
 if exists(select 1 from event_quality_issues where status='resolved'and event_id not in(md5('1:3')::uuid,md5('15:1')::uuid,md5('15:2')::uuid,md5('15:3')::uuid))then raise exception 'Protected finding resolved';end if;
 if exists(select 1 from event_quality_issues where evidence<>'{"original":"do not replace"}'::jsonb or reviewed_by is not null)then raise exception 'Evidence or review attribution changed';end if;
 if exists(select 1 from event_quality_current where not('KEEP_OTHER'=any(open_issue_codes))or not('KEEP_OTHER'=any(issue_codes)))then raise exception 'Unrelated current finding changed';end if;
 if(select count(*)from admin_review_repairs where previous_value->>'status'='open'and next_value->>'status'='resolved'and previous_value->'evidence'=next_value->'evidence')<>4 then raise exception 'Before/after audit missing';end if;
 if exists(select 1 from original_events o join events e using(id)where o.value<>to_jsonb(e))or exists(select 1 from original_sources o join event_sources s using(id)where o.value<>to_jsonb(s))then raise exception 'Content changed';end if;
 result:=api_private.run_review_automatic_resolution(200,false);
 if result->>'publisher_description_findings'<>'0'then raise exception 'Resolver is not idempotent';end if;
 if has_function_privilege('anon','api_private.reconcile_publisher_event_copy(integer,boolean)','execute')or has_function_privilege('authenticated','api_private.event_description_reuse_expected(uuid)','execute')then raise exception 'Browser execution granted';end if;
end $check$;
-- Source changes restore the native finding rather than permanently dismiss it.
update event_sources set payload=jsonb_set(payload,'{normalized,title}','"Changed"')where id=md5('1:3')::uuid;
do $check$begin
 if not exists(select 1 from event_quality_findings(md5('1:3')::uuid)where issue_code='DESCRIPTION_REUSED')then raise exception 'Source change did not restore finding';end if;
end $check$;
"""
sql=schema+paths[0].read_text()+checks
with tempfile.TemporaryDirectory(prefix='qg-publisher-copy-') as tmp:
 data=Path(tmp)/'data'
 subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55492 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:
  subprocess.run([str(PG/'psql'),'-h',tmp,'-p','55492','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True,stdout=subprocess.DEVNULL)
 finally:
  subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: 15 source cohorts, DST, detector integration, pause, ownership, evidence, audit, idempotency and source-change reopening')
