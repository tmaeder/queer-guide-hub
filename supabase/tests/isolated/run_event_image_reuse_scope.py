#!/usr/bin/env python3
"""Exercise the production reuse assessment against adversarial current/old observations."""
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


schema = """
create role anon;create role authenticated;create role service_role;
create schema auth;
create function auth.uid()returns uuid language sql stable as $$select null::uuid$$;
create function public.assert_admin_or_internal()returns void language sql as $$select$$;
create table events(id uuid primary key,images text[],is_recurring boolean,series_key text,
 status text default 'active',duplicate_of_id uuid);
create table event_image_quality_observations(event_id uuid references events(id),image_url text,
 content_hash text,probe_status text,primary key(event_id,image_url));
"""
paths = list((ROOT / 'supabase/migrations').glob('*_event_image_reuse_scope.sql'))
if len(paths) != 1:
    raise SystemExit('Exactly one reuse-scope migration required')
sql = schema + paths[0].read_text() + (HERE / 'event_image_reuse_scope.sql').read_text()
with tempfile.TemporaryDirectory(prefix='qg-artwork-reuse-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale', '--wal-segsize=1'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'postgres.log'),
                    '-o', f'-k {tmp} -p 55497 -c listen_addresses= -c min_wal_size=2MB -c max_wal_size=16MB', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run([binary('psql'), '-h', tmp, '-p', '55497', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, check=True)
    finally:
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
