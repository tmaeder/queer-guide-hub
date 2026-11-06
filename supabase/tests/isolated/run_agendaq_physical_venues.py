#!/usr/bin/env python3
"""Exercise source-location matching in a disposable PostgreSQL cluster only."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]


def binary(name):
    found = str(Path(os.environ['PG_BINDIR']) / name) if os.environ.get('PG_BINDIR') else shutil.which(name)
    if not found:
        raise SystemExit(f'{name} missing; set PG_BINDIR')
    return found


schema = """
create role anon; create role authenticated; create role service_role;
create function assert_admin_or_internal() returns void language sql as 'select';
create table countries(id uuid primary key,code text);
create table cities(id uuid primary key,country_id uuid);
create table events(id uuid primary key,title text,venue_id uuid,venue_name text,
 start_date timestamptz,status text default 'active',duplicate_of_id uuid,city_id uuid,country_id uuid,
 latitude numeric,longitude numeric,updated_at timestamptz default now(),field_provenance jsonb default '{}');
create table venues(id uuid primary key,name text,category text default 'bar',duplicate_of_id uuid,
 closed_at timestamptz,city_id uuid,country_id uuid,latitude numeric,longitude numeric);
create table event_sources(id uuid primary key,event_id uuid,source_slug text,source_entity_id text,
 source_url text,payload_hash text,payload jsonb);
create table venue_sources(id uuid primary key,venue_id uuid,source_slug text,source_entity_id text,
 source_url text,payload_hash text,payload jsonb);
create table review_queue(id uuid primary key default gen_random_uuid(),entity_type text,entity_id uuid,
 review_type text,details jsonb,status text,resolved_by uuid,resolved_at timestamptz);
create table event_quality_issues(id uuid primary key default gen_random_uuid(),event_id uuid,
 issue_code text,status text,resolved_at timestamptz,reviewed_at timestamptz,reviewed_by uuid,resolution text);
create table event_quality_current(event_id uuid primary key,open_issue_codes text[]);
create function haversine_m(a numeric,b numeric,c numeric,d numeric) returns double precision
 language sql immutable as 'select sqrt(power((a-c)*111000,2)+power((b-d)*80000,2))::double precision';
create table admin_automations(slug text primary key,enabled boolean);
insert into admin_automations values('event_venue_link',true);
-- The native linker itself is covered by existing tests. Its result contract and
-- enabled-state boundary are enough to exercise this migration's integration.
create function link_event_venues(integer,boolean,boolean) returns jsonb language sql as
 'select ''{"candidates":1,"linked":1}''::jsonb';
create function run_event_venue_link() returns jsonb language plpgsql as $stub$
declare v_result        jsonb;
begin
 if not(select enabled from admin_automations where slug='event_venue_link') then
  return '{"skipped":true}'::jsonb;
 end if;
 v_result := public.link_event_venues(500, true, false);
 return v_result;
end $stub$;
"""
paths = list((ROOT / 'supabase/migrations').glob('*_agendaq_physical_venue_matching.sql'))
if len(paths) != 1:
    raise SystemExit('Exactly one physical-venue matching migration required')
sql = schema + paths[0].read_text() + (Path(__file__).parent / 'agendaq_physical_venues.sql').read_text()
sql += """
alter table cities add column name text default 'Paris', add column duplicate_of_id uuid;
alter table events add column data_source text, add column external_id text,
 add column is_public boolean default true, add column safety_gated boolean default false;
alter table venues add column address text, add column postal_code text, add column safety_gated boolean default false;
alter table event_quality_issues add column evidence jsonb default '{}';
create table content_revisions(source_table text, source_id uuid, actor_kind text, changed_fields text[]);
create function city_canonical_key(text) returns text language sql immutable as 'select lower(trim($1))';
"""
sql += (ROOT / 'supabase/migrations/99991793933420_agendaq_organizer_location_binding.sql').read_text()
sql += """
-- An alias is safe only where one precise location appears in both captures.
insert into fixture_ids select n,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()
from generate_series(100,104) n;
insert into events(id,title,venue_name,start_date,city_id,country_id,latitude,longitude,data_source,external_id)
select e,'Show '||n,'Organizer '||n,'2027-01-01T00:00:00Z','00000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000001',48,2,'agendaq','show-'||n from fixture_ids where n>=100;
insert into venues(id,name,city_id,country_id,latitude,longitude,address,postal_code)
select v,'Canonical '||n,'00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',
 48,2,'10 Rue Royale','75008' from fixture_ids where n>=100;
insert into event_sources select es,e,'agendaq','show-'||n,'https://www.agendaq.fr/fr/agenda/show-'||n,repeat('a',64),
 jsonb_build_object('normalized',jsonb_build_object('start_date','2027-01-01T00:00:00Z'),'raw',
 jsonb_build_object('slug','show-'||n,'name','Show '||n,'businesses',jsonb_build_array(jsonb_build_object('name','Organizer '||n)),
 'locations',jsonb_build_array(jsonb_build_object('id',n,'cc','FR','lat',48,'lon',2,
 'addr','{"city":"Paris","street":"Rue Royale","pc":"75008"}'::jsonb)))) from fixture_ids where n>=100;
insert into venue_sources select f.vs,f.v,'agendaq','place-'||f.n,'https://www.agendaq.fr/fr/guide/place-'||f.n,repeat('b',64),
 jsonb_build_object('raw',jsonb_build_object('slug','place-'||f.n,'name','Publisher alias',
 'locations',s.payload#>'{raw,locations}')) from fixture_ids f join event_sources s on s.id=f.es where f.n>=100;
insert into event_quality_issues(event_id,issue_code,status) select e,'NAMED_VENUE_UNLINKED','open' from fixture_ids where n>=100;
update venue_sources set payload=jsonb_set(payload,'{raw,locations,0,addr,pc}','"75009"') where id=(select vs from fixture_ids where n=101);
update event_sources set payload=jsonb_set(payload,'{raw,locations}',(payload#>'{raw,locations}')||(payload#>'{raw,locations}'))
 where id=(select es from fixture_ids where n=102);
update event_quality_issues set evidence='{"manual_hold":true}' where event_id=(select e from fixture_ids where n=103);
insert into content_revisions select 'events',e,'human',array['venue_name'] from fixture_ids where n=104;
do $test$
declare r jsonb;
begin
 update admin_automations set enabled=true where slug='event_venue_link';
 r:=run_event_venue_link();
 assert (r#>>'{source_location_matches,linked_events}')::int=1,r::text;
 assert exists(select 1 from events e join fixture_ids f on f.e=e.id where f.n=100 and e.venue_id=f.v);
 assert not exists(select 1 from events e join fixture_ids f on f.e=e.id where f.n>100 and e.venue_id is not null);
end $test$;
"""
with tempfile.TemporaryDirectory(prefix='qg-agendaq-matching-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'postgres.log'),
                    '-o', f'-k {tmp} -p 55489 -c listen_addresses=', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run([binary('psql'), '-h', tmp, '-p', '55489', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
                       input=sql, text=True, check=True)
    finally:
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
