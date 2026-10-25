#!/usr/bin/env python3
"""Exercise positive phone registration and ownership boundaries in disposable PG."""
import ast
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
ROOT = Path(__file__).resolve().parents[3]
# Reuse only the schema literal, never execute another test runner.
tree = ast.parse((Path(__file__).with_name('run_gayout_venue_details.py')).read_text())
schema = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'schema' for t in n.targets)).split('insert into fixture select')[0]
def binary(name):
    return str(Path(os.environ['PG_BINDIR'])/name) if os.environ.get('PG_BINDIR') else shutil.which(name)
schema += """
create role anon;create role authenticated;create role service_role;create schema api_private;
create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text);
insert into supabase_migrations.schema_migrations values('99991792951000');
create table cities(id uuid primary key,name text,country_id uuid);
alter table organizations add column claimed_by uuid,add column website text,add column email text,add column social jsonb default '{}';
alter table venues add column verified boolean default false,add column website text,add column email text,add column address text default 'Example Street 12';
alter table venue_sources alter column id set default gen_random_uuid();
alter table venue_sources add column source_entity_id text,add column is_primary boolean;
create table venue_quality_signals(venue_id uuid,signal_type text,value numeric,source text,details jsonb);
insert into fixture select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,null from generate_series(1,20)n;
insert into countries select c,'AO'from fixture;
insert into cities select city,'Luanda',c from fixture;
insert into organizations(id,name,primary_venue_id,country_id,city_id)select o,'Venue '||n,v,c,city from fixture;
insert into venues(id,name,organization_id,country_id,city_id)select v,'Venue '||n,o,c,city from fixture;
insert into entity_quality_findings(entity_type,entity_id,dimension)select 'organization',o,'contact'from fixture;
update organizations set claim_status='claimed'where id=(select o from fixture where n=2);
insert into content_revisions select 'venues',v,'human',array['phone']from fixture where n=3;
update entity_quality_findings set waived_at=now()where entity_id=(select o from fixture where n=9);
update organizations set field_provenance=field_provenance||'{"phone":{"human_reviewed":true}}'where id=(select o from fixture where n=10);
update venues set phone_e164='+244900000000'where id=(select v from fixture where n=16);
insert into venue_sources(id,venue_id,source_slug,source_entity_id,source_url,is_primary,payload)select gen_random_uuid(),v,'gayout','123','https://www.gayout.com/venue-17',true,jsonb_build_object('normalized',jsonb_build_object('name','Venue 17','metadata',jsonb_build_object('data_source','gayout')))from fixture where n=17;
insert into entity_quality_findings(entity_type,entity_id,dimension,state)select 'organization',o,d,'source_unavailable'from fixture cross join unnest(array['editorial','media'])d where n=17;
update venues set verified=true where id=(select v from fixture where n=18);
update organizations set claimed_by=gen_random_uuid()where id=(select o from fixture where n=19);
update venues set verification_status='verified'where id=(select v from fixture where n=20);
update fixture f set old_v=to_jsonb(vv),old_o=to_jsonb(oo)from venues vv,organizations oo where vv.id=f.v and oo.id=f.o;
select set_config('matching.overture_proofs',(
select jsonb_agg(jsonb_build_object('venue_id',v.id,'organization_id',o.id,'name',v.name,'latitude',v.latitude,'longitude',v.longitude,
 'address',v.address,'country_id',f.c,'city_id',f.city,'country_code','AO','city_name','Luanda','human_reviewed',false,
 'expected_updated_at',case when n=5 then v.updated_at-interval '1 hour'else v.updated_at end,
 'observed_at',now(),'release','2026-10-21.0','contact_kind','phone','phone',case when n=8 then '1234567'else '933 472 424'end,
 'window_complete',n<>13,'window_rows',100,'window_bounds','[13.1,-8.96,13.3,-8.76]'::jsonb,
 'assets','["https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/2026-10-21.0/theme=places/type=place/part.parquet"]'::jsonb,
 'source_url','https://stac.overturemaps.org/2026-10-21.0/places/place/collection.json',
 'place',p.place,'payload_text',payload.nearby::text,'payload_sha256',case when n=6 then repeat('b',64)else encode(extensions.digest(payload.nearby::text,'sha256'),'hex')end))
from fixture f join venues v on v.id=f.v join organizations o on o.id=f.o
cross join lateral(select jsonb_build_object('id',f.s,'names',jsonb_build_object('primary',v.name),'latitude',v.latitude,'longitude',v.longitude,
 'operating_status',case when n=12 then 'closed'else 'open'end,'confidence',.99,'phones',
 case when n=11 then '["933 472 424","933 472 425"]'::jsonb else jsonb_build_array(case when n=8 then '1234567'else '933 472 424'end)end,
 'sources',jsonb_build_array(jsonb_build_object('license',case when n=15 then 'unknown'else 'CDLA-Permissive-2.0'end)),
 'addresses',jsonb_build_array(jsonb_build_object('country',case when n=4 then 'ZA'else 'AO'end,'freeform',v.address)))place)p
cross join lateral(select case when n in(7,14)then jsonb_build_array(p.place,p.place||jsonb_build_object('id',gen_random_uuid(),
 'operating_status',case when n=14 then 'closed'else 'open'end,'phones','[]'::jsonb))else jsonb_build_array(p.place)end nearby)payload)::text,false);
select set_config('matching.overture_dry_run','false',false);
"""
assertions = """
do $test$
declare f record;vv jsonb;oo jsonb;
begin
 assert current_setting('matching.overture_phone_result')::jsonb->>'venues'='2';
 for f in select *from fixture loop
  select to_jsonb(v)into vv from venues v where v.id=f.v;select to_jsonb(o)into oo from organizations o where o.id=f.o;
  if f.n in(1,17)then
   assert vv->>'phone'='+244933472424'and vv->>'phone_e164'='+244933472424';
   assert oo->>'phone'='+244933472424'and oo->'quality_checked_at'='null'::jsonb;
   assert vv-array['phone','phone_e164','updated_at']=f.old_v-array['phone','phone_e164','updated_at'];
   assert oo-array['phone','quality_checked_at','updated_at','field_provenance']=f.old_o-array['phone','quality_checked_at','updated_at','field_provenance'];
  else assert vv=f.old_v and oo=f.old_o,'Protected profile changed '||f.n;end if;
 end loop;
 assert not exists(select 1 from entity_quality_findings where dimension='contact'and state<>'fail'),'Writer fabricated quality passes';
 assert(select count(*)from entity_quality_findings where dimension in('editorial','media')and state='source_unavailable')=2,'Phone repair reopened unrelated dimensions';
 assert organization_facts_only_source((select o from fixture where n=17))->'unavailable_dimensions'='["editorial","media"]'::jsonb;
 assert(select count(*)from venue_sources)=3;
end $test$;
"""
sql=schema[:schema.index('insert into fixture select')]+(ROOT/'supabase/migrations/99991792618428_refuge_source_quality_limits.sql').read_text()+(ROOT/'supabase/migrations/99991792951000_contact_only_source_composition.sql').read_text()+schema[schema.index('insert into fixture select'):]+(ROOT/'scripts/data-quality/register-overture-phone-evidence.sql').read_text()+assertions
with tempfile.TemporaryDirectory(prefix='qg-overture-phone-')as tmp:
    data=Path(tmp)/'data'
    subprocess.run([binary('initdb'),'-D',str(data),'-A','trust','--no-locale','--wal-segsize=1'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55504 -c listen_addresses= -c min_wal_size=2MB -c max_wal_size=16MB','-w','start'],check=True,stdout=subprocess.DEVNULL)
    try:subprocess.run([binary('psql'),'-h',tmp,'-p','55504','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True)
    finally:subprocess.run([binary('pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
