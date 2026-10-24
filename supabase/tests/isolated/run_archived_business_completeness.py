#!/usr/bin/env python3
"""Run archive-scope repairs and the real organization assessment in a disposable DB."""
import ast
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

HERE = Path(__file__).parent
ROOT = HERE.parents[2]


def binary(name):
    found = str(Path(os.environ['PG_BINDIR']) / name) if os.environ.get('PG_BINDIR') else shutil.which(name)
    if not found:
        raise SystemExit(f'{name} missing; set PG_BINDIR')
    return found


tree = ast.parse((HERE / 'run_business_source_contacts.py').read_text())
schema = next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign)
              and any(isinstance(target, ast.Name) and target.id == 'schema' for target in node.targets))
schema += """
alter table organizations add column claim_status text default 'unclaimed',add column quality_checked_at timestamptz default now(),
 add column slug text default 'fixture',add column description text,add column logo_url text,add column cover_image_url text,
 add column images text[]default '{}',add column latitude float8,add column longitude float8,
 add column tags text[]default '{}',add column target_groups text[]default '{}',add column linkage_disposition text default 'linked';
alter table venues add column review_status text default 'archived',add column needs_attention boolean default false;
alter table venues add foreign key(organization_id)references organizations(id);
alter table organizations add foreign key(primary_venue_id)references venues(id);
create table events(id uuid primary key,venue_id uuid references venues(id),status text default 'archived');
create table hotels(id uuid primary key default gen_random_uuid(),organization_id uuid references organizations(id),duplicate_of_id uuid);
create table marketplace_merchants(like hotels including defaults);
create table marketplace_brands(like hotels including defaults);
create table affiliate_partners(like hotels including defaults);
create table news_sources(like hotels including defaults);
create table ingestion_staging(target_record_id uuid,source_name text,normalized_data jsonb);
create table review_queue(entity_type text,entity_id uuid,status text default 'pending');
create unique index fixture_findings on entity_quality_findings(entity_type,entity_id,dimension);
alter table entity_quality_findings add column source text default 'producer',add column waived_by uuid,add column waiver_note text;
create function organization_facts_only_source(eid uuid)returns jsonb language sql stable as $stub$
 select case when field_provenance?'fixture_facts' then '{"unavailable_dimensions":["editorial"]}'::jsonb end from organizations where id=eid $stub$;
"""
paths = list((ROOT / 'supabase/migrations').glob('*_archived_business_completeness.sql'))
if len(paths) != 1:
    raise SystemExit('Exactly one archive scope migration required')
sql = (schema + (HERE / 'archived_business_producer_fixture.sql').read_text() + paths[0].read_text()
       + (ROOT / 'supabase/migrations/99991792815100_business_quality_contract_lookup.sql').read_text()
       + (HERE / 'archived_business_completeness.sql').read_text()
       + (HERE / 'business_quality_contract_lookup.sql').read_text())
with tempfile.TemporaryDirectory(prefix='qg-archived-business-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale', '--wal-segsize=1'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'postgres.log'),
                    '-o', f'-k {tmp} -p 55496 -c listen_addresses= -c min_wal_size=2MB -c max_wal_size=16MB', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run([binary('psql'), '-h', tmp, '-p', '55496', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, check=True)
    finally:
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
