#!/usr/bin/env python3
"""Run business-quality regressions in a new, disposable local PostgreSQL cluster.

Default: restroom source contract. --superseded: duplicate-identity lifecycle.

Requires PostgreSQL 17 tools on PATH, or PG_BINDIR pointing to their directory.
No connection string or existing database is accepted.
"""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[3]
BINDIR = Path(os.environ['PG_BINDIR']) if os.environ.get('PG_BINDIR') else None

def binary(name):
    result = str(BINDIR / name) if BINDIR else shutil.which(name)
    if not result:
        raise SystemExit(f'{name} not found; set PG_BINDIR to the PostgreSQL tools directory')
    return result

SCHEMA = """
create role anon; create role authenticated; create role service_role;
create table organizations(id uuid primary key,name text,primary_venue_id uuid,duplicate_of_id uuid,
 roles text[],field_provenance jsonb default '{}',city_id uuid,country_id uuid,description text,
 website text,email text,phone text,social jsonb default '{}',logo_url text,cover_image_url text,
 images text[] default '{}',quality_dimensions jsonb default '{}',quality_checked_at timestamptz default now(),
 safety_gated boolean default true,status text default 'active');
create table venues(id uuid primary key,name text,organization_id uuid,duplicate_of_id uuid,
 closed_at timestamptz,category text,city_id uuid,country_id uuid);
create table venue_sources(id uuid primary key default gen_random_uuid(),venue_id uuid,source_slug text,
 source_entity_id text,source_url text,payload jsonb default '{}',payload_hash text);
create table entity_quality_findings(id bigint generated always as identity,entity_type text,entity_id uuid,
 dimension text,state text,reason_code text,evidence jsonb default '{}',waived_at timestamptz,checked_at timestamptz default now());
create table business_brand_quality_events(id bigint generated always as identity,entity_type text,entity_id uuid,
 dimension text,previous_value jsonb,new_value jsonb,reason_code text);
-- Authentication is outside this isolated helper/reconciliation regression.
create function assert_admin_or_internal() returns void language sql as 'select';
"""
if sys.argv[1:] == ['--superseded']:
    migrations = list((ROOT / 'supabase/migrations').glob('*_superseded_business_quality_findings.sql'))
    if len(migrations) != 1:
        raise SystemExit('Exactly one superseded business migration required')
    # Only the producer hook is stubbed here. Full producer integration is
    # checked separately against the production schema in a rollback.
    stubs = """
create function reconcile_organization_link_roles() returns void language sql as 'select';
create function refresh_business_brand_quality() returns jsonb language plpgsql as $stub$
begin
  perform public.reconcile_organization_link_roles();
  return '{}'::jsonb;
end $stub$;
"""
    sql = SCHEMA + stubs + migrations[0].read_text()
    sql += (Path(__file__).parent / 'superseded_business_quality.sql').read_text()
elif not sys.argv[1:]:
    original = (ROOT / 'supabase/migrations/20261021184341_business_facts_only_source_outcomes.sql').read_text()
    latest = (ROOT / 'supabase/migrations/20261021203842_source_specific_business_quality_limits.sql').read_text()
    reconciler = latest[latest.index('create or replace function public.reconcile_facts_only_business_findings'):]
    trigger = original[original.index('create function public.invalidate_business_source_contract'):]
    migrations = list((ROOT / 'supabase/migrations').glob('*_refuge_source_quality_limits.sql'))
    if len(migrations) != 1:
        raise SystemExit('Exactly one refuge source migration required')
    sql = SCHEMA + trigger + migrations[0].read_text() + reconciler
    sql += (Path(__file__).parent / 'refuge_source_quality.sql').read_text()
else:
    raise SystemExit('Usage: run_refuge_source_quality.py [--superseded]')

with tempfile.TemporaryDirectory(prefix='qg-refuge-test-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'postgres.log'),
                    '-o', f'-k {tmp} -p 55489 -c listen_addresses=', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run([binary('psql'), '-h', tmp, '-p', '55489', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
                       input=sql, text=True, check=True)
    finally:
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
