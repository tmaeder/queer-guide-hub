#!/usr/bin/env python3
"""Run the real reconciler migrations in a disposable native PostgreSQL cluster."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

HERE = Path(__file__).parent
ROOT = HERE.parents[2]
def binary(name):
    path = str(Path(os.environ['PG_BINDIR']) / name) if os.environ.get('PG_BINDIR') else shutil.which(name)
    if not path:
        raise SystemExit(f'{name} missing; set PG_BINDIR')
    return path

schema = """
create role anon; create role authenticated; create role service_role;
create function assert_admin_or_internal() returns void language plpgsql as $$begin
 if current_setting('test.allow_internal',true)='false' then raise insufficient_privilege;end if;
end$$;
create table organizations(id uuid primary key default gen_random_uuid(),name text,
 duplicate_of_id uuid,quality_dimensions jsonb default '{}',quality_checked_at timestamptz default now(),
 safety_gated boolean default true,status text default 'active');
create index organizations_duplicate_of_idx on organizations(duplicate_of_id)where duplicate_of_id is not null;
create table entity_quality_findings(id uuid primary key default gen_random_uuid(),entity_type text,entity_id uuid,
 dimension text,state text,reason_code text,evidence jsonb default '{}',checked_at timestamptz,
 waived_at timestamptz,waived_by uuid,unique(entity_type,entity_id,dimension));
create table business_brand_quality_events(id uuid default gen_random_uuid(),entity_type text,entity_id uuid,
 dimension text,previous_value jsonb,new_value jsonb,reason_code text);
create function reconcile_organization_link_roles()returns void language sql as 'select';
create function refresh_business_brand_quality()returns void language plpgsql as $$begin
  perform public.reconcile_organization_link_roles();
end$$;
"""
original = ROOT / 'supabase/migrations/20261022175227_superseded_business_quality_findings.sql'
patches = list((ROOT / 'supabase/migrations').glob('*_bound_superseded_business_candidates.sql'))
if len(patches) != 1:
    raise SystemExit('Exactly one bounded candidate migration required')
sql = schema + original.read_text() + """
create table original_contract as select proacl,proconfig,proowner,prosecdef from pg_proc
 where oid='reconcile_superseded_business_findings(integer,boolean)'::regprocedure;
""" + patches[0].read_text()
sql += (HERE / 'superseded_business_quality.sql').read_text()
sql += (HERE / 'bounded_superseded_business_quality.sql').read_text()
with tempfile.TemporaryDirectory(prefix='qg-superseded-business-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'postgres.log'),
                    '-o', f'-k {tmp} -p 55487 -c listen_addresses=', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run([binary('psql'), '-h', tmp, '-p', '55487', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
                       input=sql, text=True, check=True)
    finally:
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
