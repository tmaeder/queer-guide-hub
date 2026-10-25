#!/usr/bin/env python3
"""Verify complete relationship counts, news deduplication and existing case ACLs."""
import os
from pathlib import Path
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[3]
PG=Path(os.environ.get('PG_BINDIR','/opt/homebrew/opt/postgresql@17/bin'))
schema="""
create role anon;create role authenticated;create role service_role;create schema api_private;
create table countries(id uuid primary key,name text,code text);
create table cities(id uuid primary key,name text,country_id uuid,region_name text,region_code text,
 latitude numeric,longitude numeric,shell_status text,seo_indexable boolean,wikidata_qid text,wikipedia_title text,
 official_website text,data_source text,updated_at timestamptz,field_provenance jsonb);
create table geo_cms_verifications(place_id uuid,status text,checks jsonb,sources jsonb);
insert into countries values(md5('country')::uuid,'Example country','EX');
insert into cities values(md5('city')::uuid,'Example',md5('country')::uuid,'Region','EX-R',0,8,'placeholder',false,
 null,null,'https://example.test','machine',now(),'{"city_place_audit":{"status":"unresolved"}}');
insert into geo_cms_verifications values(md5('city')::uuid,'review','{"country_match":true}','[]');
create table geo_places(id uuid,parent_id uuid);
create table news_article_cities(article_id uuid,city_id uuid);
create table news_articles(id uuid,city_ids uuid[]);
create table personalities(id uuid,city_id uuid,death_city_id uuid);
create table competition_editions(id uuid,host_city_id uuid);
insert into geo_places values(md5('child')::uuid,md5('city')::uuid);
insert into news_article_cities values(md5('article')::uuid,md5('city')::uuid);
insert into news_articles values(md5('article')::uuid,array[md5('city')::uuid]),(md5('article2')::uuid,array[md5('city')::uuid]);
insert into personalities values(md5('person')::uuid,md5('city')::uuid,md5('city')::uuid);
insert into competition_editions values(md5('edition')::uuid,md5('city')::uuid);
create table admin_review_cases(id uuid,family text,required_role text,members jsonb,item jsonb,active boolean);
insert into admin_review_cases values(md5('case')::uuid,'city_identity','staff','[]',jsonb_build_object('entity_id',md5('city')::uuid),true);
create function review_case_can_read(text)returns boolean language sql as 'select coalesce(current_setting(''test.case_access'',true),''yes'')=''yes''';
create function review_case_sources_authorized(jsonb)returns boolean language sql as 'select coalesce(current_setting(''test.source_access'',true),''yes'')=''yes''';
create function api_private.get_admin_review_case_details(p_case_id uuid)returns jsonb language plpgsql stable security definer as $$
declare c admin_review_cases;v_members jsonb:='[]';v_candidates jsonb:='[]';begin
 if coalesce(current_setting('test.staff',true),'no')<>'yes' then raise exception 'Staff access required'using errcode='42501';end if;
 select *into c from admin_review_cases where id=p_case_id and active;
 if not found or not public.review_case_can_read(c.required_role) or not public.review_case_sources_authorized(c.members)then return null;end if;
 return jsonb_build_object('id',c.id,'family',c.family,'members',v_members,'candidates',v_candidates,'research',null);
end$$;
"""
for table in ['venues','events','organizations','hotels','queer_villages','festivals','guides','milestones','competition_entrants','trip_destinations','trip_places','reservations','city_favorites','user_place_marks','user_presence_location','intimate_cruising_mode']:
 schema+=f"create table {table}(id uuid,city_id uuid);insert into {table} values(md5('{table}')::uuid,md5('city')::uuid),(md5('other-{table}')::uuid,md5('other-city')::uuid);\n"
checks="""
do $$declare r jsonb;begin
 begin perform api_private.get_admin_review_case_details(md5('case')::uuid);raise exception 'Staff gate bypassed';
 exception when insufficient_privilege then null;end;
 perform set_config('test.staff','yes',true);
 perform set_config('test.case_access','no',true);
 if api_private.get_admin_review_case_details(md5('case')::uuid)is not null then raise exception 'Case ACL bypassed';end if;
 perform set_config('test.case_access','yes',true);perform set_config('test.source_access','no',true);
 if api_private.get_admin_review_case_details(md5('case')::uuid)is not null then raise exception 'Source ACL bypassed';end if;
 perform set_config('test.source_access','yes',true);
 r:=api_private.get_admin_review_case_details(md5('case')::uuid);
 if r#>>'{city_context,name}'<>'Example' or r#>>'{city_context,latitude}'<>'0'then raise exception 'Stored identity missing %',r;end if;
 if r#>>'{city_context,relationship_counts,news_articles}'<>'2' then raise exception 'News duplicated';end if;
 if r#>>'{city_context,relationship_counts,saved_and_private_links}'<>'7'then raise exception 'Private relationships missing';end if;
 if exists(select 1 from jsonb_each(r#>'{city_context,relationship_counts}')x where x.key not in('news_articles','saved_and_private_links')and x.value<>'1'::jsonb)then raise exception 'Missing or cross-city relationships %',r;end if;
 if(select count(*)from jsonb_object_keys(r#>'{city_context,relationship_counts}'))<>15 then raise exception 'Incomplete count contract';end if;
 if has_function_privilege('authenticated','api_private.admin_review_city_context(uuid)','execute')or has_function_privilege('anon','api_private.admin_review_city_context(uuid)','execute')then raise exception 'Direct browser helper access';end if;
 update admin_review_cases set family='venue';
 if api_private.get_admin_review_case_details(md5('case')::uuid)->'city_context'<>'null'::jsonb then raise exception 'Unrelated family changed';end if;
 if api_private.get_admin_review_case_details(md5('missing')::uuid)is not null or api_private.admin_review_city_context(md5('missing')::uuid)is not null then raise exception 'Missing record fabricated';end if;
end$$;
"""
paths=list((ROOT/'supabase/migrations').glob('*_review_city_decision_context.sql'));assert len(paths)==1
with tempfile.TemporaryDirectory(prefix='qg-city-context-')as tmp:
 data=Path(tmp)/'data'
 subprocess.run([str(PG/'initdb'),'-D',str(data),'-A','trust','--no-locale'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55499 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:
  result=subprocess.run([str(PG/'psql'),'-h',tmp,'-p','55499','-d','postgres','-v','ON_ERROR_STOP=1'],input=schema+paths[0].read_text()+checks,text=True,capture_output=True)
  if result.returncode:raise RuntimeError(result.stderr)
 finally:
  subprocess.run([str(PG/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
print('PASS: 15 complete count groups, news dedup, cross-city exclusion, private aggregates, staff/case/source ACLs, browser denial and missing/unrelated cases')
