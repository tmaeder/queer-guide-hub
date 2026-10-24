#!/usr/bin/env python3
"""Exercise audited business spine repairs in a disposable cluster, never an existing DB."""
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
create role anon;create role authenticated;create role service_role;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function assert_admin_or_internal() returns void language sql as 'select';
create table organizations(id uuid primary key,name text,status text default 'active',duplicate_of_id uuid,primary_venue_id uuid,
 city_id uuid,country_id uuid,roles text[] default array['venue'],claimed_by uuid,claim_status text default 'unclaimed',
 last_verified_at timestamptz,field_provenance jsonb default '{}',website text,description text,safety_gated boolean default false,updated_at timestamptz default now());
create table venues(id uuid primary key,organization_id uuid,name text,duplicate_of_id uuid,closed_at timestamptz,city_id uuid,country_id uuid,safety_gated boolean default false);
create table venue_merge_audit(id uuid primary key,keep_id uuid,drop_id uuid,created_at timestamptz default now(),undone_at timestamptz);
create table entity_merge_audit(id uuid primary key default gen_random_uuid(),entity_type text,keep_id uuid,drop_id uuid,actor uuid,details jsonb default '{}',undone_at timestamptz);
create table entity_quality_findings(id bigint generated always as identity primary key,entity_type text default 'organization',entity_id uuid,state text default 'fail',waived_at timestamptz);
create table org_slug_redirects(organization_id uuid);create table org_link_suggestions(organization_id uuid);
create table hotels(organization_id uuid);create table marketplace_brands(organization_id uuid);
create table marketplace_merchants(organization_id uuid);create table affiliate_partners(organization_id uuid);create table news_sources(organization_id uuid);
create table business_brand_quality_events(id uuid primary key default gen_random_uuid(),entity_type text,entity_id uuid,dimension text,previous_value jsonb,new_value jsonb,reason_code text);
-- Explicit fixture stubs. Real merge cores, gap trigger, redirects, source data
-- and all protected fields were separately checked in production rollbacks.
create function location_is_high_risk(uuid,uuid) returns boolean language sql as 'select false';
create function merge_gap_patch(text,survivor jsonb,donor jsonb) returns jsonb language sql as $$
 select case when donor->>'website' is not null and survivor->>'website' is null then jsonb_build_object('website',donor->'website') else '{}'::jsonb end$$;
create function merge_entities(p_type text,p_keep_id uuid,p_drop_id uuid) returns jsonb language plpgsql as $stub$
declare audit_id uuid;begin
 assert p_type='organization' and auth.uid() is null;
 update venues set organization_id=p_keep_id where organization_id=p_drop_id;
 update organizations set duplicate_of_id=p_keep_id where id=p_drop_id;
 if exists(select 1 from organizations where id=p_keep_id and description='mutate-in-merge') then update organizations set description='unexpected mutation' where id=p_keep_id;end if;
 insert into entity_merge_audit(entity_type,keep_id,drop_id,actor) values('organization',p_keep_id,p_drop_id,null) returning id into audit_id;
 return jsonb_build_object('audit_id',audit_id);
end $stub$;
create function reconcile_superseded_business_findings(integer,boolean) returns jsonb language plpgsql as $stub$
declare n int;begin
 update entity_quality_findings f set state='not_applicable' from organizations o where o.id=f.entity_id and o.duplicate_of_id is not null and f.state in('fail','pending') and f.waived_at is null;
 get diagnostics n=row_count;return jsonb_build_object('findings_reconciled',n);
end $stub$;
create function refresh_business_brand_quality() returns jsonb language plpgsql as $stub$
begin
  perform public.reconcile_superseded_business_findings(500,false);
 return '{"existing_producer":true}'::jsonb;
end $stub$;
"""
paths = list((ROOT / 'supabase/migrations').glob('*_merged_venue_business_spine_repairs.sql'))
if len(paths) != 1:
    raise SystemExit('Exactly one merged venue business spine migration required')
selector = ROOT / 'supabase/migrations/99991792814000_business_spine_keyed_selector.sql'
sql = schema + paths[0].read_text() + selector.read_text() + (Path(__file__).parent / 'merged_venue_business_spines.sql').read_text()
with tempfile.TemporaryDirectory(prefix='qg-business-spines-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale', '--wal-segsize=1'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'postgres.log'),
                    '-o', f'-k {tmp} -p 55493 -c listen_addresses= -c min_wal_size=2MB -c max_wal_size=16MB', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run([binary('psql'), '-h', tmp, '-p', '55493', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
                       input=sql, text=True, check=True)
    finally:
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
