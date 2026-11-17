#!/usr/bin/env python3
"""Verify geographic-guard expression indexes in a disposable PostgreSQL cluster."""
import os,pathlib,shutil,subprocess,tempfile
root=pathlib.Path(__file__).resolve().parents[3]
bin=pathlib.Path(os.environ['PG_BINDIR']) if os.environ.get('PG_BINDIR') else pathlib.Path(shutil.which('pg_ctl') or '/missing').parent
sql=r"""
\set ON_ERROR_STOP on
create schema extensions;
create extension unaccent with schema extensions;
create function public.normalize_name(n text) returns text language sql immutable
set search_path to 'public','pg_catalog','extensions' as $$
select btrim(regexp_replace(lower(extensions.unaccent(coalesce(n,''))),'[^a-z0-9]+',' ','g'));
$$;
create table cities(id integer primary key,name text,duplicate_of_id integer);
create table queer_villages(id integer primary key,name text,duplicate_of_id integer);
insert into cities select i,'City '||i,null from generate_series(1,20000)i;
insert into cities values(20001,'München',null),(20002,'Merged City',1),(20003,null,null);
insert into queer_villages select i,'Village '||i,null from generate_series(1,180)i;
insert into queer_villages values(181,'Merged Village',1);
create function is_geographic(n text) returns boolean language sql stable as $$
select exists(select 1 from cities p where p.duplicate_of_id is null and normalize_name(p.name)=normalize_name(n))
or exists(select 1 from queer_villages p where normalize_name(p.name)=normalize_name(n));
$$;
create table expected as select n,is_geographic(n) result from unnest(array['MÜNCHEN','Merged City','Merged Village','No such venue',null,'City-1','VILLAGE 2'])n;
create table cities_before as select * from cities;
create table villages_before as select * from queer_villages;
begin;
"""
sql+=(root/'supabase/migrations/20261117193506_index_review_geographic_name_checks.sql').read_text()
sql+=r"""
commit;
analyze cities;analyze queer_villages;
set plan_cache_mode='force_generic_plan';
prepare geographic_name(text) as select exists(select 1 from cities p where p.duplicate_of_id is null and normalize_name(p.name)=normalize_name($1))
or exists(select 1 from queer_villages p where normalize_name(p.name)=normalize_name($1));
do $$declare plan jsonb;r boolean;i integer;begin
if exists(select 1 from expected where result is distinct from is_geographic(n)) then raise exception 'Eligibility or normalization changed';end if;
if not is_geographic('MÜNCHEN') or is_geographic('Merged City') or not is_geographic('Merged Village') or is_geographic('No such venue') then raise exception 'Geographic guard semantics changed';end if;
if exists((select * from cities except select * from cities_before) union all (select * from cities_before except select * from cities)) then raise exception 'Cities changed';end if;
if exists((select * from queer_villages except select * from villages_before) union all (select * from villages_before except select * from queer_villages)) then raise exception 'Villages changed';end if;
execute 'explain(format json) execute geographic_name(''No such venue'')' into plan;
if position('cities_review_geographic_name_idx' in plan::text)=0 or position('queer_villages_review_geographic_name_idx' in plan::text)=0 then raise exception 'Geographic indexes not used: %',plan;end if;
end$$;
set statement_timeout='5s';
do $$declare i integer;r boolean;begin
for i in 1..1000 loop execute 'execute geographic_name(''No such venue'')' into r;if r then raise exception 'False geographic match';end if;end loop;
raise notice 'PASS: 1000 generic-plan misses; accents/null/punctuation; merged-city exclusion, merged-village inclusion; row preservation and both index plans';end$$;
"""
with tempfile.TemporaryDirectory(prefix='qg-review-geographic-') as tmp:
 data=str(pathlib.Path(tmp)/'data')
 subprocess.run([str(bin/'initdb'),'-D',data,'-A','trust','--no-locale','--encoding=UTF8'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([str(bin/'pg_ctl'),'-D',data,'-l',str(pathlib.Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55488 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try: subprocess.run([str(bin/'psql'),'-h',tmp,'-p','55488','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,check=True)
 finally: subprocess.run([str(bin/'pg_ctl'),'-D',data,'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
