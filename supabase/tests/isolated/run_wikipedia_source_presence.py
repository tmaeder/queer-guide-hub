#!/usr/bin/env python3
"""Validate explicit missing-source observations and protected business facts."""
import ast
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
tree=ast.parse((Path(__file__).with_name('run_gayout_venue_details.py')).read_text())
schema=next(ast.literal_eval(n.value)for n in tree.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='schema'for t in n.targets)).split('insert into fixture select')[0]
url_migration=(ROOT/'supabase/migrations/20260702100000_marketplace_affiliate_backfill.sql').read_text()
schema+='create role anon;create role authenticated;create role service_role;create schema api_private;\n'
schema+=re.search(r'CREATE OR REPLACE FUNCTION public.url_decode\(p text\).*?END; \$\$;',url_migration,re.S).group(0)
schema+='''
alter table venue_sources add column source_entity_id text;
alter table entity_quality_findings add column evidence jsonb default '{}';
create function organization_facts_only_source(uuid)returns jsonb language sql stable as $$select null::jsonb$$;
create function refresh_business_brand_quality()returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select o.source_contract from(select o.*,public.organization_facts_only_source(o.id) source_contract from organizations o)o
 where o.id=current_setting('fixture.profile')::uuid
$$;
'''
setup='''
insert into fixture select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,null from generate_series(1,35)n;
insert into countries select c,'AO'from fixture;
insert into organizations(id,name,primary_venue_id,country_id,city_id)select o,'Fixture '||n,v,c,city from fixture;
insert into venues(id,name,organization_id,country_id,city_id)select v,'Fixture '||n,o,c,city from fixture;
insert into entity_quality_findings(entity_type,entity_id,dimension)select 'organization',o,'editorial'from fixture;
insert into venue_sources(id,venue_id,source_slug,source_entity_id,source_url,payload_hash,payload)
 select s,v,'nude-places','wp:Fixture_'||n||'|Angola','https://en.wikipedia.org/wiki/Fixture_'||n,repeat('a',64),
 jsonb_build_object('raw',jsonb_build_object('name','Fixture '||n,'description','Fixture '||n,'country','Angola'),
 'normalized',jsonb_build_object('name','Fixture '||n,'description','Social nudity place in Angola.','metadata',jsonb_build_object('source','wikipedia')))from fixture;
update organizations set claim_status='claimed'where id=(select o from fixture where n=2);
update organizations set roles=array['venue','support']where id=(select o from fixture where n=3);
update organizations set field_provenance=field_provenance||'{"phone":{"human_reviewed":true}}'where id=(select o from fixture where n=4);
insert into content_revisions select 'venues',v,'human',array['description']from fixture where n=5;
update entity_quality_findings set waived_at=now()where entity_id=(select o from fixture where n=6);
update venue_sources set payload=jsonb_set(payload,'{raw,phone}','"+244933472424"')where id=(select s from fixture where n=7);
update venue_sources set payload=jsonb_set(payload,'{raw,description}','"An actual source description supplied by the registered publisher must remain enrichment work."')where id=(select s from fixture where n=8);
update venue_sources set payload=jsonb_set(payload,'{normalized,images}','["https://official.example/poster.jpg"]')where id=(select s from fixture where n=9);
insert into venue_sources select gen_random_uuid(),venue_id,'independent',source_url,payload_hash,payload,last_seen_at,source_entity_id from venue_sources where id=(select s from fixture where n=10);
insert into venues(id,name,organization_id,country_id,city_id)select gen_random_uuid(),'Other physical branch',o,c,city from fixture where n=11;
update venue_sources set source_url='https://en.wikipedia.org/wiki/Category:Fixture_17',source_entity_id='wp:Category:Fixture_17'where id=(select s from fixture where n=17);
update venue_sources set source_url='https://en.wikipedia.org/wiki/%FF',source_entity_id='wp:Bad'where id=(select s from fixture where n=24);
update venues set duplicate_of_id=gen_random_uuid()where id=(select v from fixture where n=25);
update organizations set duplicate_of_id=gen_random_uuid()where id=(select o from fixture where n=26);
update venues set closed_at=now()where id=(select v from fixture where n=27);
update venue_sources set source_slug='unknown'where id=(select s from fixture where n=28);
update venue_sources set payload=jsonb_set(jsonb_set(payload,'{raw,country}','null'),'{normalized,description}','"A meaningful supplied description remains work even without a source country name."')where id=(select s from fixture where n=29);
update organizations set last_verified_at=now()where id=(select o from fixture where n=30);
update organizations set field_provenance=field_provenance||'{"images":"unknown ownership"}'where id=(select o from fixture where n=31);
update venue_sources set payload=jsonb_set(payload,'{raw,name}','"Different entity"')where id=(select s from fixture where n=32);
update organizations set name='Fixture+é'where id=(select o from fixture where n=33);
update venues set name='Fixture+é'where id=(select v from fixture where n=33);
update venue_sources set source_url='https://en.wikipedia.org/wiki/Fixture+%C3%A9',source_entity_id='wp:Fixture+é',
 payload=jsonb_set(jsonb_set(jsonb_set(payload,'{raw,name}','"Fixture+é"'),'{raw,description}','"Fixture+é"'),'{normalized,name}','"Fixture+é"')where id=(select s from fixture where n=33);
update fixture f set old_v=to_jsonb(vv),old_o=to_jsonb(oo)from venues vv,organizations oo where vv.id=f.v and oo.id=f.o;
create table old_sources as select id,to_jsonb(s)row from venue_sources s;
create table proofs as select f.n,jsonb_build_object('contract','registered_wikipedia_page_presence:v1','human_reviewed',false,
 'id',v.id,'name',v.name,'organization_id',o.id,'source_id',s.id,'source_entity_id',case when n=16 then 'wp:Wrong_16'else s.source_entity_id end,
 'source_url',s.source_url,'payload_hash',case when n=13 then repeat('b',64)else s.payload_hash end,
 'updated_at',case when n=19 then v.updated_at-interval '1 hour'else v.updated_at end,
 'requested_title',coalesce(api_private.registered_wikipedia_source_title(s.source_url,s.source_entity_id),'Bad'),
 'observed_at',case when n=12 then now()-interval '2 hours'else now()end,
 'http_status',case when n=18 then 403 else 200 end,'result',case when n=35 then 'present'else 'missing'end,
 'api_url',case when n=34 then 'https://other.example/api'else 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=info&titles=Fixture'end,
 'response_sha256',repeat('a',64),'selected_page_json',body.page::text,
 'selected_page_sha256',encode(extensions.digest(body.page::text,'sha256'),'hex'))p
 from fixture f join venues v on v.id=f.v join organizations o on o.id=f.o join venue_sources s on s.id=f.s
 cross join lateral(select jsonb_build_object('title',case when n=14 then 'Wrong'else coalesce(api_private.registered_wikipedia_source_title(s.source_url,s.source_entity_id),'Bad')end,
 'ns',0,'missing',n<>35)||case when n in(15,35)then '{"pageid":123}'::jsonb else '{}'::jsonb end page)body;
select register_wikipedia_source_observations((select jsonb_agg(p)from proofs),false);
-- Later presence, source drift and identity changes invalidate the missing scope.
select register_wikipedia_source_observations((select jsonb_build_array(jsonb_set(jsonb_set(jsonb_set(jsonb_set(p,'{result}','"present"'),'{observed_at}',to_jsonb(now()+interval '1 second')),
 '{selected_page_json}',to_jsonb(page::text)),'{selected_page_sha256}',to_jsonb(encode(extensions.digest(page::text,'sha256'),'hex'))))
 from proofs cross join lateral(select jsonb_build_object('title','Fixture 20','ns',0,'missing',false,'pageid',123)page)body where n=20),false);
update venue_sources set payload_hash=repeat('c',64)where id=(select s from fixture where n=21);
update venue_sources set source_url='https://en.wikipedia.org/wiki/Other'where id=(select s from fixture where n=22);
update venues set name='Human corrected identity'where id=(select v from fixture where n=23);
'''
assertions='''
do $test$
declare f record;scope jsonb;cur_v jsonb;cur_o jsonb;
begin
 for f in select *from fixture loop
  scope:=api_private.organization_missing_wikipedia_source(f.o);
  assert(scope is not null)=(f.n in(1,33)),'Unexpected unavailable scope '||f.n||' '||coalesce(scope::text,'null');
  if f.n in(1,33)then
   perform set_config('fixture.profile',f.o::text,false);
   assert refresh_business_brand_quality()=scope,'Ordinary producer ignored source evidence';
  end if;
  select to_jsonb(v)into cur_v from venues v where v.id=f.v;select to_jsonb(o)into cur_o from organizations o where o.id=f.o;
  if f.n<>23 then assert cur_v=f.old_v,'Observation changed venue '||f.n;end if;
  assert cur_o-array['quality_checked_at','updated_at']=f.old_o-array['quality_checked_at','updated_at'],'Observation changed profile facts';
 end loop;
 assert not exists(select 1 from venue_sources s join old_sources old on old.id=s.id where s.id not in(select fixture.s from fixture where n in(21,22))and to_jsonb(s)is distinct from old.row),'Observation changed registered source';
 assert not exists(select 1 from entity_quality_findings where state<>'fail'),'Observation writer fabricated quality passes';
 assert not exists(select 1 from api_private.venue_source_presence_observations x join fixture pick on pick.s=x.source_id where pick.n in(12,13,14,15,16,17,18,19,24,25,26,28,34)),'Invalid capture was recorded';
 assert(select quality_checked_at is null from organizations where id=(select o from fixture where n=1)),'Actual source outcome did not schedule reassessment';
 assert(select quality_checked_at=(old_o->>'quality_checked_at')::timestamptz from organizations join fixture on organizations.id=fixture.o where fixture.n=2),'Protected profile was needlessly invalidated';
 assert(register_wikipedia_source_observations((select jsonb_agg(p)from proofs),false)->>'observations_recorded')::int=0,'Exact captures were not idempotent';
 assert not has_table_privilege('authenticated','api_private.venue_source_presence_observations','select');
 assert not has_function_privilege('authenticated','register_wikipedia_source_observations(jsonb,boolean)','execute');
end $test$;
'''
# Exercise the actual new migration after real observation registration.
regional_setup = """
update organizations set quality_checked_at=now();
-- Only an exact normalized derivative of structured location fields qualifies.
update venue_sources set payload=jsonb_set(jsonb_set(jsonb_set(payload,
 '{raw,region}','"Regional fixture"'),'{raw,venue_subtype}','"Other"'),
 '{normalized,description}','"Social nudity place in Regional fixture, Angola."')where id=(select s from fixture where n=1);
create table regional_old_organizations as select id,to_jsonb(o)row from organizations o;
"""
regional_assertions = """
do $test$declare f record;scope jsonb;
begin
 for f in select *from fixture loop
  assert(api_private.organization_missing_wikipedia_source(f.o)is not null)=(f.n in(1,33)),'Original exclusion regressed '||f.n;
 end loop;
 assert api_private.organization_missing_wikipedia_source((select o from fixture where n=1))is not null;
 assert(select quality_checked_at is null from organizations where id=(select o from fixture where n=1));
 assert(select quality_checked_at is not null from organizations where id=(select o from fixture where n=33)),'Already qualifying scope needlessly invalidated';
 assert not exists(select 1 from organizations o join regional_old_organizations old using(id)
  where to_jsonb(o)-'quality_checked_at' is distinct from old.row-'quality_checked_at'),'Migration changed canonical profile fields';
 assert not exists(select 1 from entity_quality_findings where state<>'fail'),'Migration invented passes';
 -- These changes must each revoke the scope, including absent CASE inputs.
 for f in select *from(values
  ('{raw,region}'::text[],'null'::jsonb),
  ('{raw,country}'::text[],'null'::jsonb),
  ('{raw,region}'::text[],'123'::jsonb),
  ('{raw,region}'::text[],'""'::jsonb),
  ('{raw,venue_subtype}'::text[],'"Beach"'::jsonb),
  ('{raw,description}'::text[],'"Actual publisher narrative"'::jsonb),
  ('{normalized,description}'::text[],'"Short but specific publisher description"'::jsonb),
  ('{normalized,description}'::text[],'"Social nudity place in Different region, Angola."'::jsonb),
  ('{normalized,phone}'::text[],'"+244933472424"'::jsonb),
  ('{normalized,images}'::text[],'["https://source.example/artwork.jpg"]'::jsonb)
 )x(path,value)loop
  update venue_sources set payload=jsonb_set(payload,f.path,f.value)where id=(select s from fixture where n=1);
  assert api_private.organization_missing_wikipedia_source((select o from fixture where n=1))is null,'Structured label scope leaked for '||f.path::text;
  update venue_sources set payload=(select row->'payload'from regional_old_sources where id=venue_sources.id)where id=(select s from fixture where n=1);
 end loop;
 update organizations set field_provenance=field_provenance||'{"description":{"human_reviewed":true}}'where id=(select o from fixture where n=1);
 assert api_private.organization_missing_wikipedia_source((select o from fixture where n=1))is null,'Human description lost protection';
end $test$;
"""

# All source mutation in the setup is deliberate drift, never writer output.
sql=schema+(ROOT/'supabase/migrations/99991792812600_wikipedia_missing_source_evidence.sql').read_text()+setup+assertions+regional_setup+"create table regional_old_sources as select id,to_jsonb(s)row from venue_sources s;"+(ROOT/'supabase/migrations/99991792818000_wikipedia_regional_generated_label.sql').read_text()+regional_assertions

def binary(name):return str(Path(os.environ['PG_BINDIR'])/name)if os.environ.get('PG_BINDIR')else shutil.which(name)
with tempfile.TemporaryDirectory(prefix='qg-wikipedia-presence-')as tmp:
 data=Path(tmp)/'data'
 subprocess.run([binary('initdb'),'-D',str(data),'-A','trust','--no-locale','--wal-segsize=1'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([binary('pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55507 -c listen_addresses= -c min_wal_size=2MB -c max_wal_size=16MB','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:subprocess.run([binary('psql'),'-h',tmp,'-p','55507','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True)
 finally:subprocess.run([binary('pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
