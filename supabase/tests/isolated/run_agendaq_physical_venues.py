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
