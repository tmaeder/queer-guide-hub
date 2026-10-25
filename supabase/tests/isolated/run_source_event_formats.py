#!/usr/bin/env python3
"""Test source/ownership refusals in disposable PostgreSQL, without npm installs."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
schema="""
create role anon;create role authenticated;create role service_role;
create schema api_private;create schema auth;
create function auth.uid()returns uuid language sql as 'select null::uuid';
create function assert_admin_or_internal()returns void language sql as 'select';
create table events(id uuid primary key,title text,start_date timestamptz,event_type text default 'other',
 duplicate_of_id uuid,data_source text default 'qcal',external_id text,field_provenance jsonb default '{}',
 updated_at timestamptz default now(),description text default 'Keep description',is_public boolean default false,
 latitude numeric default 47,longitude numeric default 8,venue_id uuid);
create table event_sources(id uuid primary key,event_id uuid,source_slug text,source_entity_id text,source_url text,payload_hash text,payload jsonb);
create table event_quality_issues(id uuid primary key,event_id uuid,issue_code text,status text default 'open',
 detector text default 'event-quality-scan',reviewed_by uuid,reviewed_at timestamptz,resolution text,resolved_at timestamptz,evidence jsonb default '{}');
create table event_quality_current(event_id uuid,open_issue_codes text[],issue_codes text[],quality_score int default 61);
create table content_revisions(source_table text,source_id uuid,actor_kind text,changed_fields text[]);
create table admin_review_repairs(entity_type text,entity_id uuid,reason text,previous_value jsonb,next_value jsonb);
create table admin_automations(slug text,enabled boolean);insert into admin_automations values('review_automatic_resolution',true);
create function event_quality_findings(uuid)returns table(issue_code text)language sql stable as
 'select ''CATEGORY_UNRESOLVED''from events where id=$1 and event_type=''other'' union all select ''IMAGE_MISSING''';
create function api_private.run_review_automatic_resolution(p_batch integer,p_dry_run boolean)returns jsonb language plpgsql as $$
declare v_limit integer:=p_batch;begin return '{"publisher_description_findings":0}'::jsonb || jsonb_build_object('dry_run',p_dry_run,'existing',0);end$$;
insert into events(id,title,start_date,external_id)
 select md5(n::text)::uuid,'Board Game Night','2026-10-25T12:00:00Z',n::text from generate_series(1,31)n;
update events set title='Drag Brunch'where id=md5('2')::uuid;
update events set title='Sunday Meditation Class'where id=md5('3')::uuid;
update events set title='Queer Climb Night'where id=md5('4')::uuid;
update events set title='Youth Art Showcase'where id=md5('5')::uuid;
insert into event_sources select e.id,e.id,'qcal',e.external_id,'https://qcal.app/event/'||e.external_id,repeat('a',64),
 jsonb_build_object('normalized',jsonb_build_object('sourceId',e.external_id,'title',e.title,'start_date',e.start_date,
 'metadata',jsonb_build_object('source','qcal')),'raw',jsonb_build_object('title',e.title,'slug',e.external_id,'url','https://qcal.app/event/'||e.external_id))from events e;
insert into event_quality_issues(id,event_id,issue_code)select id,id,'CATEGORY_UNRESOLVED'from events;
insert into event_quality_current select id,array['CATEGORY_UNRESOLVED','IMAGE_MISSING'],array['CATEGORY_UNRESOLVED','IMAGE_MISSING'],61 from events;
update events set field_provenance='{"event_type":{"source":"human"}}'where id=md5('6')::uuid;
insert into content_revisions values('events',md5('7')::uuid,'human',array['event_type']);
update event_quality_issues set evidence='{"manual_hold":"TRUE"}'where id=md5('8')::uuid;
update event_quality_issues set evidence='{"manual_review_required":true}'where id=md5('9')::uuid;
update event_quality_issues set reviewed_by=md5('human')::uuid where id=md5('10')::uuid;
update event_quality_issues set reviewed_at=now()where id=md5('11')::uuid;
update event_quality_issues set resolution='retain'where id=md5('12')::uuid;
update event_quality_issues set status='accepted'where id=md5('13')::uuid;
update events set duplicate_of_id=md5('1')::uuid where id=md5('14')::uuid;
update events set event_type='social'where id=md5('15')::uuid;
update event_sources set source_entity_id='wrong'where id=md5('16')::uuid;
update event_sources set payload_hash='invalid'where id=md5('17')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,title}','"Wrong"')where id=md5('18')::uuid;
update event_sources set payload=jsonb_set(payload,'{raw,title}','"Wrong"')where id=md5('19')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,start_date}','"bad timestamp"')where id=md5('20')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,start_date}','"2026-10-26T12:00:00Z"')where id=md5('21')::uuid;
update event_sources set source_url='https://evil.example/22'where id=md5('22')::uuid;
update events set title='Book Club: Drag Show'where id=md5('23')::uuid;
update events set title='Pride and Prejudice'where id=md5('24')::uuid;
update event_quality_issues set detector='human'where id=md5('25')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,metadata,source}','"unknown"')where id=md5('26')::uuid;
update events set data_source='ticketmaster',title='Drag Show'where id in(select md5(n::text)::uuid from generate_series(27,30)n);
update event_sources s set source_slug='ticketmaster',source_url=null,payload=jsonb_build_object('normalized',
 jsonb_build_object('name','Drag Show','sourceId',s.source_entity_id,'sourceName','ticketmaster',
 'dates',jsonb_build_object('start','2026-10-25T12:00:00Z'),
 'metadata',jsonb_build_object('ticketmaster_id',s.source_entity_id)))where id in(select md5(n::text)::uuid from generate_series(27,30)n);
update event_sources set payload=jsonb_set(payload,'{normalized,metadata,ticketmaster_id}','"wrong"')where id=md5('28')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,dates,start}','"2026-10-26T12:00:00Z"')where id=md5('29')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,sourceName}','"unknown"')where id=md5('30')::uuid;
insert into event_sources select md5('duplicate-source')::uuid,event_id,source_slug,source_entity_id,source_url,payload_hash,payload from event_sources where id=md5('31')::uuid;
create table before_events as select id,to_jsonb(e) value from events e;
"""
checks="""
do $$declare r jsonb;label text;begin
 foreach label in array array['Pride and Prejudice','Book Club: Drag Show','The Drag Show: Painting Class',
 'Bear Night','Leather Weekend','Karaoke','Comedy of Errors','Drag Racing','Games Night']loop
  if api_private.source_explicit_event_format(label)is not null then raise exception 'Ambiguous title accepted: %',label;end if;
 end loop;
 if api_private.source_explicit_event_format(null)is not null then raise exception 'Null title';end if;
 r:=api_private.reconcile_source_event_formats(100,true);
 if(r->>'corrected_events')::int<>6 or exists(select 1 from admin_review_repairs)then raise exception 'Dry result %',r;end if;
 if exists(select 1 from events e join before_events b using(id)where to_jsonb(e)<>b.value)then raise exception 'Dry wrote';end if;
 r:=api_private.reconcile_source_event_formats(2,true);if(r->>'corrected_events')::int<>2 then raise exception 'Batch bound';end if;
 r:=api_private.reconcile_source_event_formats(0,false);if(r->>'corrected_events')::int<>0 then raise exception 'Zero bound';end if;
 update admin_automations set enabled=false;
 r:=api_private.reconcile_source_event_formats(100,false);if r->>'skipped'<>'paused'then raise exception 'Pause ignored';end if;
 update admin_automations set enabled=true;
 if has_function_privilege('authenticated','api_private.reconcile_source_event_formats(integer,boolean)','execute')then raise exception 'Browser access';end if;
 r:=api_private.run_review_automatic_resolution(100,false);
 if(r#>>'{source_event_formats,corrected_events}')::int<>6 or not(r?'publisher_description_findings')then raise exception 'Hook failed %',r;end if;
 if(select count(*)from admin_review_repairs)<>12 then raise exception 'Audits missing';end if;
 if exists(select 1 from events e join before_events b using(id)where e.id not in(select md5(n::text)::uuid from generate_series(1,5)n union all select md5('27')::uuid)and to_jsonb(e)<>b.value)then raise exception 'Refused record changed';end if;
 if exists(select 1 from events e join before_events b using(id)where (to_jsonb(e)-'event_type'-'field_provenance'-'updated_at')<>(b.value-'event_type'-'field_provenance'-'updated_at'))then raise exception 'Protected event changed';end if;
 if exists(select 1 from event_quality_current where quality_score<>61 or not('IMAGE_MISSING'=any(open_issue_codes)))then raise exception 'Unrelated issue changed';end if;
 r:=api_private.reconcile_source_event_formats(100,false);if(r->>'corrected_events')::int<>0 or(select count(*)from admin_review_repairs)<>12 then raise exception 'Not idempotent';end if;
end$$;
"""
paths=list((ROOT/'supabase/migrations').glob('*_source_explicit_event_formats.sql'));assert len(paths)==1
if '--temporary-sql' in sys.argv:
 # Hosted fallback when local disk cannot fit initdb. Every fixture and function
 # lives in this transaction's pg_temp namespace; no public DDL or data writes.
 import re
 sql=schema+paths[0].read_text()+checks
 sql=sql.replace('create role anon;create role authenticated;create role service_role;','').replace('create schema api_private;create schema auth;','')
 sql=sql.replace('api_private.','pg_temp.').replace('public.','pg_temp.').replace('auth.uid','pg_temp.fixture_uid')
 sql=sql.replace('create function assert_admin_or_internal','create function pg_temp.assert_admin_or_internal').replace('create function event_quality_findings','create function pg_temp.event_quality_findings')
 sql=re.sub(r'create table ', 'create temporary table ',sql)
 print("begin;set local statement_timeout='30s';"+sql+"select 'temporary fixture tests passed' result;rollback;")
 raise SystemExit(0)
with tempfile.TemporaryDirectory(prefix='qg-source-format-')as tmp:
 data=Path(tmp)/'data'
 subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55499 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:
  result=subprocess.run([str(PG/'psql'),'-h',tmp,'-p','55499','-d','postgres','-v','ON_ERROR_STOP=1'],input=schema+paths[0].read_text()+checks,text=True,capture_output=True)
  if result.returncode:raise RuntimeError(result.stderr)
 finally:
  subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: 31 source/ownership cases, ambiguous formats, dry/bounds/pause/grants, native hook composition, protected content, audit and idempotency')
