#!/usr/bin/env python3
"""Test candidate selection in a disposable local cluster; no existing DB URL is accepted.
Set PG_BINDIR when PostgreSQL tools are not on PATH. Authentication is stubbed;
live grants and real-schema integration must also be checked before rollout.
"""
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
create table source_reliability(source_slug text,entity_type text,weight numeric,primary key(source_slug,entity_type));
create table ingestion_staging(id uuid primary key,created_at timestamptz,entity_type text,target_table text,
 source_name text,ai_validation_status text,review_status text,disposition text,enriched_data jsonb,
 ai_confidence_score numeric,pipeline_run_id uuid);
create table review_queue(id uuid primary key default gen_random_uuid(),entity_type text,entity_id uuid,
 review_type text,details jsonb,status text,resolved_by uuid,resolved_at timestamptz);
"""
paths = list((ROOT / 'supabase/migrations').glob('*_actionable_review_gate_candidates.sql'))
if len(paths) != 1:
    raise SystemExit('Exactly one candidate-selection migration required')
outcomes = list((ROOT / 'supabase/migrations').glob('*_staging_gate_review_outcomes.sql'))
if len(outcomes) != 1:
    raise SystemExit('Exactly one staging outcome migration required')
sql = schema + paths[0].read_text() + outcomes[0].read_text()
sql += (Path(__file__).parent / 'review_gate_candidates.sql').read_text()
sql += (Path(__file__).parent / 'staging_gate_review_outcomes.sql').read_text()
with tempfile.TemporaryDirectory(prefix='qg-review-gate-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'postgres.log'),
                    '-o', f'-k {tmp} -p 55489 -c listen_addresses=', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run([binary('psql'), '-h', tmp, '-p', '55489', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
                       input=sql, text=True, check=True)
    finally:
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
