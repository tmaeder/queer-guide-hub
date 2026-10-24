#!/usr/bin/env python3
"""Run the real bounded cleanup, preserving source/library/human review data."""
import os
from pathlib import Path
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
schema="""
create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
create schema supabase_migrations;create schema cron;
create function auth.uid()returns uuid language sql as $$select null::uuid$$;
create function assert_admin_or_internal()returns void language sql as $$select$$;
create table supabase_migrations.schema_migrations(version text);insert into supabase_migrations.schema_migrations values('99991792816500');
create table admin_automations(slug text,enabled boolean,lifecycle_state text);
insert into admin_automations values('queer_image_backfill_event',false,'consolidated'),('event_image_backfill',true,'active');
create table cron.job(jobname text,active boolean);insert into cron.job values('event_image_backfill',true);
create table events(id uuid primary key,title text,created_by uuid,verification_status text default 'unverified',status text default 'completed',duplicate_of_id uuid,images text[],field_provenance jsonb default '{}',updated_at timestamptz default now(),is_public boolean default false,safety_flags jsonb default '{"preserve":true}');
create table event_sources(id uuid primary key,event_id uuid,source_slug text,source_entity_id text,source_url text,payload jsonb,payload_hash text);
create table image_assets(id uuid primary key,url text,url_hash text,source text,source_ref text,metadata jsonb default '{}');
create table image_asset_links(asset_id uuid,entity_type text,entity_id uuid,role text,added_by uuid,added_at timestamptz default now());
create table content_revisions(source_table text,source_id uuid,actor_kind text,changed_fields text[]);
create table event_quality_issues(event_id uuid,dimension text,reviewed_by uuid,status text default 'open');
create table event_quality_current(event_id uuid,marker text default 'native assessment');
insert into events(id,title,images)select md5(n::text)::uuid,'Event '||n,array['https://img.queer.guide/event-images/'||repeat(md5(n::text),2)||'.jpg']from generate_series(1,27)n;
insert into event_sources select md5('source'||n)::uuid,e.id,'siegessaeule','mix/event-'||n||'/2026-10-07/20:00','https://www.siegessaeule.de/termine/mix/event-'||n||'/2026-10-07/20:00/',
 jsonb_build_object('raw',jsonb_build_object('url','https://www.siegessaeule.de/termine/mix/event-'||n||'/2026-10-07/20:00/','source','siegessaeule'),
 'normalized',jsonb_build_object('title',e.title,'sourceId','mix/event-'||n||'/2026-10-07/20:00','images','[]'::jsonb,'metadata',jsonb_build_object('source','siegessaeule')),'enriched','{}'::jsonb),repeat('a',64)
 from generate_series(1,27)n join events e on e.id=md5(n::text)::uuid;
insert into image_assets select md5('asset'||n)::uuid,e.images[1],encode(extensions.digest(e.images[1],'sha256'),'hex'),'scraper','pexels:'||n,'{}'from generate_series(1,27)n join events e on e.id=md5(n::text)::uuid;
insert into image_asset_links select md5('asset'||n)::uuid,'event',md5(n::text)::uuid,'cover',null,now()from generate_series(1,27)n;
insert into image_asset_links values(md5('asset21')::uuid,'event',md5('21')::uuid,'gallery',null,now()),(md5('asset1')::uuid,'event',md5('unrelated')::uuid,'cover',null,now());
insert into event_quality_current select id,'native assessment'from events;
insert into event_quality_issues(event_id,dimension)select id,'media'from events;
update events set created_by=md5('human')::uuid where id=md5('2')::uuid;
update events set verification_status='verified'where id=md5('3')::uuid;
update events set field_provenance='{"images":{"human_reviewed":true}}'where id=md5('4')::uuid;
insert into content_revisions values('events',md5('5')::uuid,'human',array['images']);
update event_quality_issues set reviewed_by=md5('human')::uuid where event_id=md5('6')::uuid;
update image_asset_links set added_by=md5('human')::uuid where entity_id=md5('7')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,images}','["https://publisher.example/poster.jpg"]')where event_id=md5('8')::uuid;
update event_sources set payload=jsonb_set(payload,'{raw,image}','"https://publisher.example/poster.jpg"')where event_id=md5('9')::uuid;
insert into event_sources select md5('second source')::uuid,event_id,'independent',source_entity_id,source_url,payload,payload_hash from event_sources where event_id=md5('10')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,title}','"Different event"')where event_id=md5('11')::uuid;
update event_sources set source_url='https://publisher.example/changed'where event_id=md5('12')::uuid;
update image_assets set source_ref=null where id=md5('asset13')::uuid;
update image_assets set source='admin_upload'where id=md5('asset14')::uuid;
update events set images=array['https://publisher.example/photo.jpg']where id=md5('15')::uuid;
update image_assets set url='https://publisher.example/photo.jpg',url_hash=encode(extensions.digest('https://publisher.example/photo.jpg','sha256'),'hex')where id=md5('asset15')::uuid;
update events set duplicate_of_id=md5('parent')::uuid where id=md5('16')::uuid;
update events set status='cancelled'where id=md5('17')::uuid;
update events set images=images||array['https://publisher.example/other.jpg']where id=md5('18')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,metadata,image_url}','"https://publisher.example/poster.jpg"')where event_id=md5('19')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,unrecognized}','true')where event_id=md5('20')::uuid;
update event_sources set source_slug='other'where event_id=md5('22')::uuid;
update events set field_provenance='{"images":{}}'where id=md5('23')::uuid;
update event_sources set payload=jsonb_set(payload,'{raw,new_capture}','true')where event_id=md5('24')::uuid;
update event_sources set payload=payload||'{"new_capture":true}'where event_id=md5('25')::uuid;
update event_sources set payload=jsonb_set(payload,'{enriched,description}','"New supplied evidence"')where event_id=md5('26')::uuid;
update event_sources set payload=jsonb_set(payload,'{normalized,images}','null')where event_id=md5('27')::uuid;
create table before_events as select id,to_jsonb(e)row from events e;
create table before_sources as select id,to_jsonb(s)row from event_sources s;
create table before_assets as select id,to_jsonb(a)row from image_assets a;
create table before_links as select to_jsonb(k)row from image_asset_links k;
create table before_issues as select to_jsonb(i)row from event_quality_issues i;
create function reject_issue_mutation()returns trigger language plpgsql as $$begin raise exception 'Cleanup tried to write a quality finding';end$$;
create trigger issue_immutable before insert or update or delete on event_quality_issues for each statement execute function reject_issue_mutation();
"""
base_assert="""
do $$begin
 assert not exists(select 1 from before_sources b full join event_sources s using(id)where b.row is distinct from to_jsonb(s)),'Source records changed';
 assert not exists(select 1 from before_assets b full join image_assets a using(id)where b.row is distinct from to_jsonb(a)),'Library assets changed';
 assert(select jsonb_agg(row order by row::text)from before_issues)=(select jsonb_agg(to_jsonb(i)order by to_jsonb(i)::text)from event_quality_issues i),'Findings changed';
end $$;
"""
dry_assert="""
do $$begin
 assert((select result from native_receipts order by id desc limit 1)->>'eligible')::int=2;
 assert not exists(select 1 from before_events b full join events e using(id)where b.row is distinct from to_jsonb(e)),'Dry run changed events';
 assert(select count(*)from event_quality_current)=27;
 assert(select count(*)from image_asset_links)=29;
end $$;
"""
apply_assert="""
do $$declare r record;begin
 assert((select result from native_receipts order by id desc limit 1)->>'cleaned')::int=2;
 for r in select e.*,b.row old from events e join before_events b using(id)loop
  if r.id in(md5('1')::uuid,md5('21')::uuid)then
   assert cardinality(r.images)=0;
   assert r.field_provenance#>>'{images,outcome}'='removed_unrelated_machine_stock';
   assert(to_jsonb(r)-array['old','images','updated_at','field_provenance'])=(r.old-array['images','updated_at','field_provenance']),'Unrelated event fields changed';
   assert not exists(select 1 from image_asset_links where entity_type='event'and entity_id=r.id),'Removed photo is still linked';
   assert not exists(select 1 from event_quality_current where event_id=r.id),'Native assessment was not invalidated';
  else assert to_jsonb(r)-'old'=r.old,'Protected event changed';end if;
 end loop;
 assert(select count(*)from image_asset_links)=26;
 assert exists(select 1 from image_asset_links where entity_id=md5('unrelated')::uuid),'Unrelated photo link changed';
 assert(select count(*)from event_quality_current)=25;
end $$;
"""
operator=(ROOT/'scripts/data-quality/retire-auto-stock-event-artwork.sql').read_text()
operator=operator.replace('\ncommit;',"\ncreate temporary table if not exists native_receipts(id bigint generated always as identity,result jsonb);insert into native_receipts(result)select current_setting('matching.event_stock_result')::jsonb;\ncommit;")
apply=operator.replace('do $repair$',"select set_config('matching.event_stock_dry_run','false',true);\ndo $repair$",1)
with tempfile.TemporaryDirectory(prefix='qg-stock-cleanup-')as tmp:
 data=Path(tmp)/'data'
 subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale','--wal-segsize=1'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55509 -c listen_addresses= -c min_wal_size=2MB -c max_wal_size=16MB','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:
  for mode in ['normal','missing_release']:
   subprocess.run([str(PG/'createdb'),'-h',tmp,'-p','55509',mode],check=True)
   cmd=[str(PG/'psql'),'-h',tmp,'-p','55509','-d',mode,'-v','ON_ERROR_STOP=1']
   subprocess.run(cmd,input=schema,text=True,check=True,stdout=subprocess.DEVNULL)
   if mode=='normal':
    repeat="do $$begin assert((select result from native_receipts order by id desc limit 1)->>'eligible')::int=0;end$$;"
    subprocess.run(cmd,input=operator+base_assert+dry_assert+apply+base_assert+apply_assert+operator+repeat,text=True,check=True,stdout=subprocess.DEVNULL)
   else:
    subprocess.run(cmd,input='delete from supabase_migrations.schema_migrations;',text=True,check=True,stdout=subprocess.DEVNULL)
    r=subprocess.run(cmd,input=apply,text=True,capture_output=True)
    assert r.returncode and 'Deploy stock producer retirement before cleanup'in r.stderr,r.stderr
    subprocess.run(cmd,input="do $$begin assert not exists(select 1 from before_events b full join events e using(id)where b.row is distinct from to_jsonb(e));end$$;",text=True,check=True,stdout=subprocess.DEVNULL)
   print('PASS',mode)
 finally:subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: 27 source/ownership cases, dry run, whole-row guards, immutable findings/library, missing-release refusal and replay')
