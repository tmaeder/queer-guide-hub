#!/usr/bin/env python3
"""Keep image findings bound to current primary media, without changing evidence."""
import os
from pathlib import Path
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
schema='''
create schema auth;create schema api_private;
create function auth.uid()returns uuid language sql as $$select null::uuid$$;
create function public.assert_admin_or_internal()returns void language sql as $$select$$;
create table events(id uuid primary key,images text[]default '{}',duplicate_of_id uuid,start_date timestamptz default now()+interval '7 days',end_date timestamptz,title text default 'Preserved');
create table event_quality_current(event_id uuid);
create table event_quality_issues(id uuid primary key,event_id uuid,dimension text default 'media',detector text default 'event-image-quality',status text default 'open',reviewed_by uuid,reviewed_at timestamptz,evidence jsonb,issue_code text default 'IMAGE_CONTENT_REUSED',resolved_at timestamptz,resolution text,evidence_hash text default 'preserved hash');
create table event_image_quality_observations(event_id uuid,image_url text,content_hash text default 'preserved content hash',probe_status text default 'pass',checked_at timestamptz default now(),primary key(event_id,image_url));
create function api_private.run_event_quality_scan(p_batch integer default 500,p_scope text default 'all',p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fixture$
declare r record;v_assessed int:=0;v_opened int:=0;v_resolved int:=0;
 v_just_resolved int:=0;
begin
  for r in
    select e.* from public.events e left join public.event_quality_current qc on qc.event_id=e.id
    where false loop v_assessed:=v_assessed+1;end loop;
 return jsonb_build_object('scope',p_scope,'dry_run',p_dry_run,'assessed',v_assessed,
 'issues_seen',v_opened,'issues_resolved',v_resolved);
end $fixture$;
create function public.run_event_quality_scan(p_batch integer default 500,p_scope text default 'all',p_dry_run boolean default true)
returns jsonb language sql set search_path=''as $$select api_private.run_event_quality_scan($1,$2,$3)$$;
revoke all on function public.run_event_quality_scan(integer,text,boolean)from public,anon;
grant execute on function public.run_event_quality_scan(integer,text,boolean)to service_role,authenticated;
insert into events(id)select md5(n::text)::uuid from generate_series(1,20)n;
insert into event_image_quality_observations(event_id,image_url)select id,'https://images.example/old-'||n||'.jpg'from generate_series(1,20)n join events e on e.id=md5(n::text)::uuid;
insert into event_quality_issues(id,event_id,evidence)select md5('issue'||n)::uuid,id,jsonb_build_object('url','https://images.example/old-'||n||'.jpg')from generate_series(1,20)n join events e on e.id=md5(n::text)::uuid;
update events set images=array['https://images.example/new.jpg']where id=md5('2')::uuid;
update events set images=array['https://images.example/old-3.jpg']where id=md5('3')::uuid;
update event_quality_issues set reviewed_by=md5('human')::uuid where event_id=md5('4')::uuid;
update event_quality_issues set reviewed_at=now()where event_id=md5('5')::uuid;
update event_quality_issues set status='accepted'where event_id=md5('6')::uuid;
update event_quality_issues set detector='other-producer'where event_id=md5('7')::uuid;
update event_quality_issues set dimension='validity'where event_id=md5('8')::uuid;
update event_quality_issues set issue_code='UNKNOWN_FUTURE_IMAGE_ISSUE'where event_id=md5('9')::uuid;
update event_quality_issues set evidence='{}'where event_id=md5('10')::uuid;
update event_quality_issues set evidence='{"url":""}'where event_id=md5('11')::uuid;
insert into event_image_quality_observations(event_id,image_url)values(md5('11')::uuid,'');
update event_quality_issues set evidence='{"url":123}'where event_id=md5('12')::uuid;
insert into event_image_quality_observations(event_id,image_url)values(md5('12')::uuid,'123');
delete from event_image_quality_observations where event_id=md5('13')::uuid;
update event_quality_issues set evidence=evidence||'{"governance_resolution":"human"}'where event_id=md5('14')::uuid;
update event_quality_issues set evidence=evidence||'{"image_role":"gallery"}'where event_id=md5('15')::uuid;
update events set images=array['https://images.example/new.jpg','https://images.example/old-16.jpg']where id=md5('16')::uuid;
update events set duplicate_of_id=md5('parent')::uuid where id=md5('17')::uuid;
update events set start_date=now()-interval '7 days'where id=md5('18')::uuid;
update event_quality_issues set issue_code='IMAGE_LOW_RESOLUTION'where event_id=md5('19')::uuid;
update event_image_quality_observations set probe_status='fail'where event_id=md5('19')::uuid;
update event_quality_issues set issue_code='IMAGE_MISSING',detector='event-quality-scan'where event_id=md5('20')::uuid;
create table before_events as select id,to_jsonb(e)row from events e;
create table before_issues as select id,to_jsonb(i)row from event_quality_issues i;
create table before_observations as select to_jsonb(o)row from event_image_quality_observations o;
'''
migration=(ROOT/'supabase/migrations/99991792950000_current_event_artwork_findings.sql').read_text()
checks='''
do $$declare i record;begin
 assert api_private.resolve_obsolete_event_image_issues(0,'all',false)=0;
 assert api_private.resolve_obsolete_event_image_issues(500,'all',true)=0;
 assert api_private.resolve_obsolete_event_image_issues(500,'all',null)=0;
 assert not exists(select 1 from before_issues b join event_quality_issues q using(id)where b.row<>to_jsonb(q)),'Dry/zero/null run changed issues';
 begin perform api_private.resolve_obsolete_event_image_issues(10,'invalid',false);raise exception 'Invalid scope accepted';exception when raise_exception then assert sqlerrm='Invalid event quality scope';end;
 assert(public.run_event_quality_scan(1,'current',false)->>'obsolete_image_issues_resolved')::int=1;
 assert(select count(*)from event_quality_issues where status='resolved')=1,'Batch cap was ignored';
 assert(public.run_event_quality_scan(500,'historical',false)->>'issues_resolved')::int=1;
 assert(select status='resolved'from event_quality_issues where event_id=md5('18')::uuid),'Historical scope skipped its case';
 assert(public.run_event_quality_scan(500,'all',false)->>'obsolete_image_issues_resolved')::int=3;
 for i in select q.*,b.row previous from event_quality_issues q join before_issues b using(id)loop
  if i.event_id in(md5('1')::uuid,md5('2')::uuid,md5('16')::uuid,md5('18')::uuid,md5('19')::uuid)then
   assert i.status='resolved'and i.resolution='superseded_primary_artwork';
   assert(to_jsonb(i)-array['previous','status','resolved_at','resolution'])=(i.previous-array['status','resolved_at','resolution']),'Evidence or review metadata changed';
  else assert to_jsonb(i)-'previous'=i.previous,'Protected/current finding changed';end if;
 end loop;
 assert not exists(select 1 from before_events b join events e using(id)where b.row<>to_jsonb(e)),'Canonical event changed';
 assert(select jsonb_agg(row order by row::text)from before_observations)=(select jsonb_agg(to_jsonb(o)order by to_jsonb(o)::text)from event_image_quality_observations o),'Historical observations changed';
 assert(public.run_event_quality_scan(500,'all',false)->>'issues_resolved')::int=0,'Replay was not idempotent';
 assert not has_function_privilege('anon','api_private.resolve_obsolete_event_image_issues(integer,text,boolean)','execute');
 assert not has_function_privilege('authenticated','api_private.resolve_obsolete_event_image_issues(integer,text,boolean)','execute');
 assert has_function_privilege('service_role','public.run_event_quality_scan(integer,text,boolean)','execute');
end$$;
-- A newly observed defect on a restored old URL must remain active again.
update events set images=array['https://images.example/old-1.jpg']where id=md5('1')::uuid;
insert into event_quality_issues(id,event_id,evidence)values(md5('new current observation')::uuid,md5('1')::uuid,'{"url":"https://images.example/old-1.jpg"}');
do $$begin assert api_private.resolve_obsolete_event_image_issues(500,'all',false)=0;assert(select status='open'from event_quality_issues where id=md5('new current observation')::uuid);end$$;
'''
with tempfile.TemporaryDirectory(prefix='qg-current-artwork-')as tmp:
 data=Path(tmp)/'data'
 subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale','--wal-segsize=1'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55511 -c listen_addresses= -c min_wal_size=2MB -c max_wal_size=16MB','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:
  base=[str(PG/'psql'),'-h',tmp,'-p','55511','-d','postgres','-v','ON_ERROR_STOP=1']
  subprocess.run(base,input='create role anon;create role authenticated;create role service_role;',text=True,check=True,stdout=subprocess.DEVNULL)
  subprocess.run(base,input=schema+migration+checks,text=True,check=True,stdout=subprocess.DEVNULL)
  # Real competing event-row lock: skip it now, resolve on the next native run.
  fixture="insert into events(id)values(md5('locked')::uuid);insert into event_image_quality_observations(event_id,image_url)values(md5('locked')::uuid,'https://images.example/old-locked.jpg');insert into event_quality_issues(id,event_id,evidence)values(md5('locked issue')::uuid,md5('locked')::uuid,'{\"url\":\"https://images.example/old-locked.jpg\"}');"
  subprocess.run(base,input=fixture,text=True,check=True,stdout=subprocess.DEVNULL)
  holder=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
  holder.stdin.write("begin;select id from events where id=md5('locked')::uuid for update;\\echo READY\n");holder.stdin.flush()
  while True:
   line=holder.stdout.readline()
   if 'READY'in line:break
   if not line:raise RuntimeError('Lock session ended')
  subprocess.run(base,input="set lock_timeout='300ms';do $$begin assert api_private.resolve_obsolete_event_image_issues(500,'all',false)=0;end$$;",text=True,check=True,stdout=subprocess.DEVNULL)
  holder.stdin.write('rollback;\n\\q\n');holder.stdin.flush();holder.communicate(timeout=10)
  subprocess.run(base,input="do $$begin assert api_private.resolve_obsolete_event_image_issues(500,'all',false)=1;end$$;",text=True,check=True,stdout=subprocess.DEVNULL)
  subprocess.run([str(PG/'createdb'),'-h',tmp,'-p','55511','drift'],check=True)
  drift=[str(PG/'psql'),'-h',tmp,'-p','55511','-d','drift','-v','ON_ERROR_STOP=1']
  subprocess.run(drift,input=schema.replace('select e.* from public.events e left join','select e.id from public.events e left join'),text=True,check=True,stdout=subprocess.DEVNULL)
  refused=subprocess.run(drift+['-1'],input=migration,text=True,capture_output=True)
  assert refused.returncode and 'Event quality scanner anchor changed'in refused.stderr,refused.stderr
  subprocess.run(drift,input="do $$begin assert to_regprocedure('api_private.resolve_obsolete_event_image_issues(integer,text,boolean)')is null;end$$;",text=True,check=True,stdout=subprocess.DEVNULL)
 finally:subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: 20 current/history/review/evidence cases, scope/batch/dry/null/ACL/replay, row-lock contention and atomic drift refusal')
