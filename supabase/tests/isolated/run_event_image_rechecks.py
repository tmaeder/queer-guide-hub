#!/usr/bin/env python3
"""Exercise bounded image recheck claims in a disposable cluster, never an existing DB."""
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


schema = "\ncreate role anon;create role authenticated;create role service_role;create schema auth;\ncreate function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''test.actor'',true),'''')::uuid';\ncreate function assert_admin_or_internal() returns void language sql as 'select';\ncreate table events(id uuid primary key,status text default 'active',duplicate_of_id uuid,images text[]);\ncreate table event_quality_worker_leases(worker text primary key,lease_token uuid,lease_until timestamptz,claimed_at timestamptz);\n-- Stub admits only the fixture host. Production retains its real URL guard.\ncreate function event_quality_url_is_safe(t text) returns boolean language sql immutable as\n 'select t like ''https://images.example.test/%''';\n"
paths = list((ROOT / 'supabase/migrations').glob('*_event_image_targeted_rechecks.sql'))
if len(paths) != 1:
    raise SystemExit('Exactly one targeted image recheck migration required')
sql = schema + paths[0].read_text() + (Path(__file__).parent / 'event_image_rechecks.sql').read_text()
with tempfile.TemporaryDirectory(prefix='qg-image-rechecks-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'postgres.log'),
                    '-o', f'-k {tmp} -p 55493 -c listen_addresses=', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run([binary('psql'), '-h', tmp, '-p', '55493', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
                       input=sql, text=True, check=True)
    finally:
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
