#!/usr/bin/env python3
"""Check promotion and existing completion guards in a disposable PostgreSQL cluster."""
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
create role anon;create role authenticated;create role service_role;
create table events(id uuid primary key,title text,description text,venue_name text,address text,website text,
 age_restriction text,accessibility_attributes text[],target_groups text[],images text[],updated_at timestamptz,
 field_provenance jsonb default '{}',enrichment_status jsonb default '{}',duplicate_of_id uuid,
 status text default 'active',end_date timestamptz,start_date timestamptz,needs_attention boolean default false);
create table event_gap_queue(event_id uuid,lane text,input_hash text,lease_token uuid,lease_until timestamptz,
 next_attempt_at timestamptz,attempts int default 0,no_change_streak int default 0,last_outcome text,
 last_details jsonb,fields_filled int default 0,updated_at timestamptz,primary key(event_id,lane));
create table event_quality_issues(event_id uuid,status text,issue_code text,evidence jsonb);
create table event_quality_current(event_id uuid);
create table event_quality_signals(event_id uuid,signal_type text,value int,source text,details jsonb);
create function event_quality_url_is_safe(t text)returns boolean language sql immutable as
 'select t like ''https://images.example.test/%''';
create function event_gap_input(e events,lane text)returns text language sql immutable as
 'select md5(to_jsonb(e)::text||lane)';
"""
paths = list((ROOT / 'supabase/migrations').glob('*_event_artwork_promotion_deduplication.sql'))
if len(paths) != 1:
    raise SystemExit('Exactly one promotion migration required')
sql = schema + (ROOT / 'supabase/migrations/20261016181146_event_gap_budget_reset_backoff.sql').read_text() + paths[0].read_text() + (Path(__file__).parent / 'event_artwork_promotion.sql').read_text()
with tempfile.TemporaryDirectory(prefix='qg-artwork-promotion-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'postgres.log'),
                    '-o', f'-k {tmp} -p 55494 -c listen_addresses=', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run([binary('psql'), '-h', tmp, '-p', '55494', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, check=True)
    finally:
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
