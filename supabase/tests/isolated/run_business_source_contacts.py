#!/usr/bin/env python3
"""Exercise bounded source contact inheritance in a disposable cluster, never an existing DB."""
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
create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
create function auth.uid() returns uuid language sql stable as 'select null::uuid';
create function assert_admin_or_internal() returns void language sql as 'select';
create table countries(id uuid primary key,code text);
create table organizations(id uuid primary key,name text,status text default 'active',duplicate_of_id uuid,
 primary_venue_id uuid,city_id uuid,country_id uuid,roles text[] default array['venue'],
 website text,website_domain text,email text,phone text,social jsonb default '{}',field_provenance jsonb default '{}',
 quality_dimensions jsonb default '{"identity":{"state":"pass"}}',updated_at timestamptz default now(),
 last_verified_at timestamptz,safety_score int default 42);
create table venues(id uuid primary key,organization_id uuid,name text,city_id uuid,country_id uuid,
 closed_at timestamptz,duplicate_of_id uuid,updated_at timestamptz default now());
create table venue_sources(id uuid primary key,venue_id uuid,source_slug text,source_entity_id text,source_url text,
 payload_hash text default repeat('a',64),last_seen_at timestamptz default now(),payload jsonb);
create table entity_quality_findings(id uuid primary key default gen_random_uuid(),entity_type text,
 entity_id uuid,dimension text,state text default 'fail',waived_at timestamptz,reason_code text default 'contact_missing',
 evidence jsonb default '{"original":true}',checked_at timestamptz);
create table business_brand_quality_events(id uuid primary key default gen_random_uuid(),entity_type text,
 entity_id uuid,dimension text,previous_value jsonb,new_value jsonb,reason_code text);
-- Deliberate fixture stub: real country-aware parsing was verified separately
-- through the production native canonicalizer in a rolled-back repair trial.
create function canonicalize_phone(t text,c text) returns jsonb language sql immutable as $stub$
 select case when t~'^\+[0-9]{11}$' then jsonb_build_object('verdict','ok','e164',t,'country',c)
 else jsonb_build_object('verdict','unparseable') end $stub$;
create function reconcile_superseded_business_findings(integer,boolean) returns jsonb language sql as 'select ''{}''::jsonb';
create function refresh_business_brand_quality() returns jsonb language plpgsql as $stub$
begin
  perform public.reconcile_superseded_business_findings(500,false);
 return '{"existing_producer":true}'::jsonb;
end $stub$;
"""
paths = list((ROOT / 'supabase/migrations').glob('*_business_source_contact_repairs.sql'))
if len(paths) != 1:
    raise SystemExit('Exactly one business contact repair migration required')
extensions = list((ROOT / 'supabase/migrations').glob('*_overture_contact_source_inheritance.sql'))
if len(extensions) != 1:
    raise SystemExit('Exactly one Overture contact migration required')
sql = schema + paths[0].read_text() + extensions[0].read_text() + (Path(__file__).parent / 'business_source_contacts.sql').read_text() + (Path(__file__).parent / 'overture_source_contacts.sql').read_text()
with tempfile.TemporaryDirectory(prefix='qg-business-contacts-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'postgres.log'),
                    '-o', f'-k {tmp} -p 55491 -c listen_addresses=', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run([binary('psql'), '-h', tmp, '-p', '55491', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
                       input=sql, text=True, check=True)
    finally:
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
