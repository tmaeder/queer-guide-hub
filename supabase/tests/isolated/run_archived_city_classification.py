#!/usr/bin/env python3
"""Exercise the actual city classification guard and native geographic verifier."""
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ['PG_BINDIR']) if os.environ.get('PG_BINDIR') else Path(shutil.which('pg_ctl') or '/missing').parent
MIGRATIONS = ROOT / 'supabase/migrations'

def function(filename, name):
    source = (MIGRATIONS / filename).read_text()
    return re.search(r'create or replace function public\.' + name + r'\(.*?end \$\$;', source, re.S).group()

schema = r"""
create role anon;create role authenticated;create role service_role;
create schema extensions;
create table countries(id uuid primary key,code text);
insert into countries values(md5('GB')::uuid,'GB');
create table cities(id uuid primary key,name text,country_id uuid,wikidata_qid text,latitude numeric,longitude numeric,
 duplicate_of_id uuid,shell_status text,seo_indexable boolean,field_provenance jsonb,enrichment_status jsonb);
create table geo_places(id uuid primary key,place_type text,city_id uuid,country_id uuid,latitude numeric,longitude numeric);
create table geo_boundaries(boundary_kind text,source_version text);
insert into geo_boundaries values('country','fixture');
create table geo_cms_verifications(place_id uuid primary key,status text,fingerprint text,checks jsonb,sources jsonb,checked_at timestamptz default now());
create function assert_admin_or_internal()returns void language sql as 'select';
create function geo_cms_fingerprint(uuid)returns text language sql stable as 'select md5($1::text)';
create function geo_country_at(numeric,numeric)returns table(iso_a2 text,match_kind text)language sql immutable as
 'select case when $1=49 then ''FR'' else ''GB'' end,''contains''';
create function geo_cms_record(uuid)returns jsonb language sql stable as
 'select jsonb_build_object(''verification'',jsonb_build_object(''checks'',checks,''sources'',sources,''status'',status)) from geo_cms_verifications where place_id=$1';
insert into cities select md5(i::text)::uuid,'Fixture '||i,md5('GB')::uuid,null,
 case when i=7 then 49 when i=10 then null else 53 end,-1,null,
 case when i in(2,3,5,7,9,10)then 'ghost'else 'real'end,
 case when i=5 then true when i=9 then null else false end,
 jsonb_build_object('city_place_audit',jsonb_build_object('status','unresolved','reason','No corroborated settlement classification',
 'fingerprint',case when i=8 then 'old'else md5(md5(i::text)::uuid::text)end,'sources',jsonb_build_array('https://example.org/source'))),
 case when i in(2,4,5,7,9,10)then '{"disposition":{"state":"not_a_city"}}'::jsonb else '{}'::jsonb end
 from generate_series(1,10)i;
update cities set duplicate_of_id=md5('1')::uuid where id=md5('6')::uuid;
insert into geo_places select id,'city',id,country_id,latitude,longitude from cities;
create table cities_before as select id,to_jsonb(c)value from cities c;
"""
original = function('20261012085728_unified_geography_cms.sql', 'geo_cms_verify')
original += function('20261012090243_geography_cms_browse_and_evidence.sql', 'geo_cms_record_evidence')
guard = (MIGRATIONS / '20261012112026_geography_city_classification_guard.sql').read_text()
patches = list(MIGRATIONS.glob('*_respect_archived_city_classification.sql'))
assert len(patches) == 1
patch = patches[0].read_text()
before = r"""
create table security_before as select proowner,proacl,proconfig,prosecdef from pg_proc where oid='geo_cms_classification_issue(uuid)'::regprocedure;
do $$begin
 if geo_cms_classification_issue(md5('2')::uuid)is null then raise exception 'Old retired classification bug not reproduced';end if;
 perform geo_cms_verify(md5('2')::uuid);
 if(select status from geo_cms_verifications where place_id=md5('2')::uuid)<>'review'then raise exception 'Old retired record should reproduce review';end if;
end$$;
"""
checks = r"""
do $$declare i integer;issue jsonb;r jsonb;begin
 for i in 1..10 loop
  issue:=geo_cms_classification_issue(md5(i::text)::uuid);
  if (issue is null) is distinct from (i in(2,6,7,8,10))then raise exception 'Wrong classification eligibility %: %',i,issue;end if;
 end loop;
 perform geo_cms_verify(md5('1')::uuid);
 if(select status from geo_cms_verifications where place_id=md5('1')::uuid)<>'review'then raise exception 'Active unresolved city lost guard';end if;
 perform geo_cms_verify(md5('2')::uuid);
 select to_jsonb(v)into r from geo_cms_verifications v where place_id=md5('2')::uuid;
 if r->>'status'<>'country_checked'or r#>>'{checks,country_match}'<>'true'or r#>>'{checks,identity_verified}'<>'false'
  or r->'checks'?'city_classification'then raise exception 'Retired record incorrectly verified as a city: %',r;end if;
 perform geo_cms_verify(md5('7')::uuid);
 select to_jsonb(v)into r from geo_cms_verifications v where place_id=md5('7')::uuid;
 if r->>'status'<>'review'or r#>>'{checks,country_match}'<>'false'or r#>>'{checks,identity_verified}'<>'false'
  then raise exception 'Retired wrong-country conflict lost: %',r;end if;
 perform geo_cms_verify(md5('10')::uuid);
 if(select status from geo_cms_verifications where place_id=md5('10')::uuid)<>'missing'then raise exception 'Missing coordinate claim changed';end if;
 if exists(select 1 from cities_before b join cities c using(id)where b.value is distinct from to_jsonb(c))then raise exception 'City data or disposition changed';end if;
 if exists((select proowner,proacl,proconfig,prosecdef from pg_proc where oid='geo_cms_classification_issue(uuid)'::regprocedure except select * from security_before))then raise exception 'Classification security changed';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix='qg-archived-classification-') as tmp:
    data = str(Path(tmp)/'data')
    subprocess.run([str(PG/'initdb'),'-D',data,'-A','trust','--no-locale','--encoding=UTF8'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(PG/'pg_ctl'),'-D',data,'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55490 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
    try:
        subprocess.run([str(PG/'psql'),'-X','-h',tmp,'-p','55490','-d','postgres','-v','ON_ERROR_STOP=1'],input=schema+original+guard+before+patch+patch+checks,text=True,check=True)
        print('PASS: retired finding reproduced; explicit archived non-city excluded; active, heuristic and public/inconsistent ghosts guarded; wrong country and missing coordinates preserved; cities/security unchanged; idempotent')
    finally:
        subprocess.run([str(PG/'pg_ctl'),'-D',data,'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
