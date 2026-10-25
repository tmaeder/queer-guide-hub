#!/usr/bin/env python3
"""Verify the actual calendar operator against isolated refusal and audit fixtures."""
import os
from pathlib import Path
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
schema="""
create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
create function auth.uid()returns uuid language sql as 'select nullif(current_setting(''test.uid'',true),'''')::uuid';
create function assert_admin_or_internal()returns void language sql as 'select';
create table countries(id uuid primary key,code text);insert into countries values(md5('DE')::uuid,'DE'),(md5('CH')::uuid,'CH');
create table events(id uuid primary key,title text,start_date timestamptz,external_id text,data_source text,country_id uuid,
 duplicate_of_id uuid,description text default 'Preserve description',seo_indexable boolean default true);
create table event_sources(event_id uuid,source_slug text,source_entity_id text,payload jsonb);
create table review_queue(id uuid primary key,entity_id uuid,entity_type text default 'event',review_type text default 'date_mismatch',
 status text default 'pending',resolved_at timestamptz,resolved_by uuid,details jsonb,created_at timestamptz default now());
create table admin_automations(slug text,enabled boolean);insert into admin_automations values('review_automatic_resolution',true);
create table content_revisions(source_table text,source_id uuid,actor_kind text,changed_fields text[]);
create table admin_review_repairs(id bigint generated always as identity,entity_type text,entity_id uuid,reason text,previous_value jsonb,next_value jsonb);
insert into events(id,title,start_date,external_id,data_source,country_id)
 select md5(i::text)::uuid,'Example '||i,'2026-12-01T19:00:00Z',(100+i)||':2026-12-01T20:00','bka-theater',md5('DE')::uuid from generate_series(1,31)i;
insert into event_sources select id,data_source,external_id,jsonb_build_object('normalized',jsonb_build_object('title',title))from events;
insert into review_queue(id,entity_id,details)select md5('q'||i)::uuid,e.id,jsonb_build_object('source','event-agentic-enrich',
 'page','https://www.bka-theater.de/content_start.php?id='||(100+i)||'&tid='||i,'start_date',e.start_date,'extracted_date','2023-12-01','keep','original')
 from generate_series(1,31)i join events e on e.id=md5(i::text)::uuid;
update review_queue set resolved_by=md5('human')::uuid where id=md5('q4')::uuid;
update review_queue set details=details||'{"force_review":true}'where id=md5('q5')::uuid;
update review_queue set details=details||'{"hard_blocker":true}'where id=md5('q6')::uuid;
update review_queue set details=details||'{"requires_confirm":true}'where id=md5('q7')::uuid;
insert into content_revisions values('events',md5('8')::uuid,'human',array['start_date']);
update review_queue set details=jsonb_set(details,'{start_date}','"2026-12-02T19:00:00Z"')where id=md5('q10')::uuid;
update events set duplicate_of_id=md5('original')::uuid where id=md5('15')::uuid;
update events set country_id=md5('CH')::uuid where id=md5('16')::uuid;
update events set country_id=null where id=md5('17')::uuid;
update review_queue set details=jsonb_set(details,'{page}','"https://www.bka-theater.de/content_start.php?id=999&tid=18"')where id=md5('q18')::uuid;
update review_queue set status='approved'where id=md5('q20')::uuid;
update review_queue set details=jsonb_set(details,'{source}','"human"')where id=md5('q21')::uuid;
update review_queue set details=details||'{"human_reviewed":true}'where id=md5('q23')::uuid;
update events set title='Edited display'where id in(md5('24')::uuid,md5('25')::uuid);
delete from event_sources where event_id=md5('25')::uuid;
update review_queue set details=details||'{"auto_resolution":"previous"}'where id=md5('q26')::uuid;
update review_queue set resolved_at=now()where id=md5('q29')::uuid;
update review_queue set review_type='date_other'where id=md5('q30')::uuid;
create table captures as select i,jsonb_build_object('source','bka-theater','url','https://www.bka-theater.de/spielplan/',
 'observed_at',now(),'body','Official publisher fixture '||i,'sha256',encode(extensions.digest('Official publisher fixture '||i,'sha256'),'hex'))capture
 from generate_series(1,31)i;
create table proofs as select i,jsonb_build_object('finding_id',q.id,'event_id',e.id,'external_id',e.external_id,'data_source',e.data_source,
 'title',e.title,'start_date',e.start_date,'expected_finding_hash',md5(to_jsonb(q)::text),'expected_event_hash',md5(to_jsonb(e)::text),
 'contract','official_event_calendar.v1','human_reviewed',false,'verified_entry',jsonb_build_object('source_key',e.external_id,'title','Example '||i,
 'start_date',e.start_date,'url','https://www.bka-theater.de/prg/'||(100+i)||'?tid='||i,'performance_id',i::text,'capture_sha256',c.capture->>'sha256'))proof
 from generate_series(1,31)i join events e on e.id=md5(i::text)::uuid join review_queue q on q.entity_id=e.id join captures c using(i);
update proofs set proof=jsonb_set(proof,'{expected_finding_hash}','"stale"')where i=2;
update proofs set proof=jsonb_set(proof,'{expected_event_hash}','"stale"')where i=3;
update proofs set proof=jsonb_set(proof,'{verified_entry,start_date}','"2026-12-02T19:00:00Z"')where i=9;
update captures set capture=jsonb_set(capture,'{observed_at}',to_jsonb(now()-interval '2 hours'))where i=11;
update captures set capture=jsonb_set(capture,'{sha256}','"bad"')where i=12;
update proofs set proof=jsonb_set(proof,'{verified_entry,capture_sha256}','"bad"')where i=12;
update captures set capture=jsonb_set(capture,'{url}','"https://other.example/spielplan/"')where i=13;
insert into proofs select *from proofs where i=14;
update proofs set proof=jsonb_set(proof,'{verified_entry,url}','"https://other.example/entry"')where i=19;
update proofs set proof=jsonb_set(proof,'{verified_entry,source_key}','"other"')where i=22;
update captures set capture=jsonb_set(capture,'{body}',to_jsonb(repeat('x',3000001)))where i=27;
update captures set capture=jsonb_set(capture,'{sha256}',to_jsonb(encode(extensions.digest(capture->>'body','sha256'),'hex')))where i=27;
update proofs set proof=jsonb_set(proof,'{verified_entry,capture_sha256}',(select capture->'sha256'from captures where i=27))where i=27;
update captures set capture=jsonb_set(capture,'{observed_at}',to_jsonb(now()+interval '1 hour'))where i=28;
update proofs set proof=jsonb_set(proof,'{verified_entry,capture_sha256}',(select capture->'sha256'from captures where i=1))where i=31;
delete from captures where i=31;
create table original_events as select id,to_jsonb(e)value from events e;
create table original_reviews as select id,to_jsonb(q)value from review_queue q;
create function refuse_event_mutations()returns trigger language plpgsql as $$begin raise exception 'Calendar confirmation attempted an event mutation';end$$;
create trigger event_immutable before update or delete on events for each statement execute function refuse_event_mutations();
select set_config('matching.event_calendar_proofs',(select jsonb_agg(proof)::text from proofs),false);
select set_config('matching.event_calendar_captures',(select jsonb_agg(capture)::text from captures),false);
"""
operator=(ROOT/'scripts/data-quality/reconcile-event-calendar-evidence.sql').read_text()
dry="""
do $$begin
 if exists(select 1 from original_events o join events e using(id)where o.value<>to_jsonb(e))
 or exists(select 1 from original_reviews o join review_queue q using(id)where o.value<>to_jsonb(q))
 or exists(select 1 from admin_review_repairs)then raise exception 'Dry/rehearsal/pause wrote data';end if;
end$$;
"""
apply="""
do $$begin
 if(current_setting('matching.event_calendar_result')::jsonb->>'resolved')::int<>3 then raise exception 'Expected exactly three confirmations: %',current_setting('matching.event_calendar_result');end if;
 if exists(select 1 from original_events o join events e using(id)where o.value<>to_jsonb(e))then raise exception 'Event content or schedule changed';end if;
 if exists(select 1 from original_reviews o join review_queue q using(id)where q.id not in(md5('q1')::uuid,md5('q24')::uuid,md5('q31')::uuid)and o.value<>to_jsonb(q))then raise exception 'A refused finding changed';end if;
 if(select count(*)from admin_review_repairs where reason='official_event_calendar_date_confirmed')<>3
 or(select count(*)from admin_review_repairs where reason='official_event_calendar_capture')<>2 then raise exception 'Incomplete audit or duplicate shared capture';end if;
 if exists(select 1 from review_queue q where q.id in(md5('q1')::uuid,md5('q24')::uuid,md5('q31')::uuid)
  and(q.status<>'resolved'or q.resolved_by is not null or q.details->>'keep'<>'original'
   or q.details#>'{official_calendar_verification,event_changed}'<>'false'::jsonb))then raise exception 'Confirmation attribution or evidence wrong';end if;
end$$;
"""
repeat="""
do $$begin
 if(current_setting('matching.event_calendar_result')::jsonb->>'resolved')::int<>0 or(select count(*)from admin_review_repairs)<>5 then raise exception 'Not idempotent';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix='qg-calendar-')as tmp:
 data=Path(tmp)/'data'
 subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55498 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
 def run(sql,success=True,message=None):
  result=subprocess.run([str(PG/'psql'),'-h',tmp,'-p','55498','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True)
  if success and result.returncode:raise RuntimeError(result.stderr)
  if not success and(result.returncode==0 or message not in result.stderr):raise RuntimeError('Expected refusal: '+result.stderr)
 try:
  run(schema)
  feed="select set_config('matching.event_calendar_proofs',(select jsonb_agg(proof)::text from proofs),false);select set_config('matching.event_calendar_captures',(select jsonb_agg(capture)::text from captures),false);"
  run(feed+operator+dry)
  run('update admin_automations set enabled=false;')
  run(feed+operator.replace('dry_run boolean:=true','dry_run boolean:=false'),False,'paused')
  run(dry+'update admin_automations set enabled=true;')
  run("select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);"+feed+operator,False,'Internal calendar verification actor')
  run(feed+operator.replace('dry_run boolean:=true','dry_run boolean:=false').replace('commit;','rollback;')+dry)
  run(feed+operator.replace('dry_run boolean:=true','dry_run boolean:=false')+apply)
  run(feed+operator.replace('dry_run boolean:=true','dry_run boolean:=false')+repeat)
 finally:
  subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: 31 calendar/ownership/source cases, dry/rehearsal/pause, protected events, shared capture audit and idempotency')
