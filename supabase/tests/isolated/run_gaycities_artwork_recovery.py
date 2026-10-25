#!/usr/bin/env python3
"""Exercise registered artwork restoration without changing review or publication."""
import ast
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
tree=ast.parse((Path(__file__).with_name('run_historical_event_brevity.py')).read_text())
schema=next(ast.literal_eval(n.value)for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='schema'for t in n.targets))
def binary(name):
 return str(Path(os.environ['PG_BINDIR'])/name)if os.environ.get('PG_BINDIR')else shutil.which(name)
schema+='''
create schema extensions;create extension unaccent with schema extensions;
alter table events add column images text[]default '{}',add column field_provenance jsonb default '{}',add column updated_at timestamptz default now(),add column publication_flag boolean default false;
create table content_revisions(source_table text,source_id uuid,actor_kind text,changed_fields text[]);
create table event_image_quality_observations(content_hash text);
create table event_quality_signals(event_id uuid,signal_type text,value int,source text,details jsonb);
create function event_quality_url_is_safe(text)returns boolean language sql immutable as $$select $1 like 'https://gaycities-featured-images-production.s3.amazonaws.com/%'$$;
create table fixture(n int,e uuid,s uuid,i uuid,old_event jsonb);
insert into fixture select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null from generate_series(1,16)n;
insert into events(id,title,external_id,start_date,end_date,status)select e,'Archive '||n,(800000+n)::text,'2020-06-01 12:00:00+00','2020-06-01 13:00:00+00','completed'from fixture;
insert into event_sources(id,event_id,source_slug,source_entity_id,source_url,payload_hash,payload)
select f.s,e.id,'gaycities',e.external_id,'https://london.gaycities.com/events/'||e.external_id||'-event',repeat('a',64),
 jsonb_build_object('raw',jsonb_build_object('url','https://london.gaycities.com/events/'||e.external_id||'-event','fromWayback',true,
 'jsonLd',jsonb_build_object('_legacyTemplate',true,'name',e.title,'startDate','2020-06-01T12:00:00',
 'image',jsonb_build_array('https://gaycities-featured-images-production.s3.amazonaws.com/events/originals/poster-'||n||'.jpg'))))from fixture f join events e on e.id=f.e;
insert into event_quality_issues(id,event_id,dimension,issue_code,evidence)select i,e,'media','IMAGE_MISSING','{}'from fixture;
insert into event_quality_current(event_id,open_issue_codes)select e,array['IMAGE_MISSING']from fixture;
update event_quality_issues set reviewed_by=gen_random_uuid()where id=(select i from fixture where n=2);
update events set field_provenance='{"images":"unknown ownership"}'where id=(select e from fixture where n=4);
insert into event_sources select gen_random_uuid(),event_id,source_slug,source_entity_id,source_url,payload_hash,payload,last_seen_at from event_sources where id=(select s from fixture where n=5);
update event_sources set payload=jsonb_set(payload,'{raw,jsonLd,name}','"Wrong event"')where id=(select s from fixture where n=6);
update event_sources set payload=jsonb_set(payload,'{raw,jsonLd,startDate}','"2020-06-02T12:00:00"')where id=(select s from fixture where n=7);
update events set images=array['https://official.example/human-image.jpg']where id=(select e from fixture where n=11);
update events set duplicate_of_id=gen_random_uuid()where id=(select e from fixture where n=12);
update events set status='active'where id=(select e from fixture where n=13);
insert into content_revisions select 'events',e,'human',array['images']from fixture where n=14;
update event_sources set source_url='https://other.example/event'where id=(select s from fixture where n=15);
update event_sources set payload=jsonb_set(payload,'{raw,jsonLd,image}','["https://gaycities-featured-images-production.s3.amazonaws.com/events/originals/another.jpg"]')where id=(select s from fixture where n=16);
update fixture f set old_event=to_jsonb(evt)from events evt where evt.id=f.e;
select set_config('matching.gaycities_artwork_proofs',(
 select jsonb_agg(jsonb_build_object('event_id',evt.id,'title',evt.title,'source_id',s.id,'source_url',s.source_url,
 'payload_hash',case when n=3 then repeat('b',64)else s.payload_hash end,'expected_updated_at',evt.updated_at,
 'url','https://gaycities-featured-images-production.s3.amazonaws.com/events/originals/poster-'||n||'.jpg',
 'human_reviewed',false,'observed_at',case when n=10 then now()-interval '2 hours'else now()end,
 'probe',jsonb_build_object('passed',true,'status',case when n=8 then 403 else 200 end,'mime_type','image/jpeg',
 'sha256',md5(n::text)||md5(n::text),'byte_size',60000,'width',case when n=9 then 400 else 1200 end,'height',800)))
 from fixture f join events evt on evt.id=f.e join event_sources s on s.id=f.s)::text,false);
select set_config('matching.gaycities_artwork_dry_run','false',false);
'''
assertions='''
do $test$
declare f record;current_event jsonb;
begin
 assert current_setting('matching.gaycities_artwork_result')::jsonb->>'promoted'='1';
 for f in select *from fixture loop
  select to_jsonb(evt)into current_event from events evt where evt.id=f.e;
  if f.n=1 then
   assert current_event->'images'='["https://gaycities-featured-images-production.s3.amazonaws.com/events/originals/poster-1.jpg"]'::jsonb;
   assert current_event-array['images','field_provenance','updated_at']=f.old_event-array['images','field_provenance','updated_at'];
   assert not exists(select 1 from event_quality_current where event_id=f.e);
  else assert current_event=f.old_event,'Protected archive mutated '||f.n;
   assert exists(select 1 from event_quality_current where event_id=f.e);end if;
 end loop;
 assert not exists(select 1 from event_quality_issues where status<>'open'),'Writer fabricated image passes';
end $test$;
'''
sql=schema+(ROOT/'scripts/data-quality/promote-gaycities-captured-artwork.sql').read_text()+assertions
with tempfile.TemporaryDirectory(prefix='qg-gaycities-artwork-')as tmp:
 data=Path(tmp)/'data'
 subprocess.run([binary('initdb'),'-D',str(data),'-A','trust','--no-locale','--wal-segsize=1'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([binary('pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55506 -c listen_addresses= -c min_wal_size=2MB -c max_wal_size=16MB','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:subprocess.run([binary('psql'),'-h',tmp,'-p','55506','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True)
 finally:subprocess.run([binary('pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
