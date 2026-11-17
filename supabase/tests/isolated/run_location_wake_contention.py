#!/usr/bin/env python3
"""Reproduce profile wake contention against two native PostgreSQL sessions."""
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ['PG_BINDIR']) if os.environ.get('PG_BINDIR') else Path(shutil.which('pg_ctl') or '/missing').parent
original = (ROOT / 'supabase/migrations/99991791810000_entity_location_completion.sql').read_text()
wake = re.search(r'create or replace function public.wake_entity_location_worker\(\).*?end \$\$;', original, re.S).group()
migrations = list((ROOT / 'supabase/migrations').glob('*_nonblocking_location_worker_wake.sql'))
assert len(migrations) == 1
migration = migrations[0].read_text()

schema = r"""
create role anon;create role authenticated;create role service_role;
create schema net;create schema vault;
create table vault.decrypted_secrets(name text,decrypted_secret text);
insert into vault.decrypted_secrets values('WEBHOOK_SECRET','fixture-secret');
create table dispatches(url text,headers jsonb,body jsonb,timeout_milliseconds integer);
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
returns bigint language plpgsql as $$begin
 insert into public.dispatches values(url,headers,body,timeout_milliseconds);return 1;
end$$;
create table entity_location_worker_lease(id boolean primary key check(id),until_at timestamptz not null,
 dispatched_at timestamptz not null);
insert into entity_location_worker_lease values(true,now()-interval '1 minute','-infinity');
create table jobs(id integer primary key,status text not null default 'pending');
"""
contract = r"""
revoke all on function wake_entity_location_worker() from public,anon,authenticated;
grant execute on function wake_entity_location_worker() to service_role;
create trigger wake after insert on jobs for each statement execute function wake_entity_location_worker();
create table original_contract as select proacl,proowner,prosecdef,proconfig from pg_proc
 where oid='wake_entity_location_worker()'::regprocedure;
"""

with tempfile.TemporaryDirectory(prefix='qg-location-wake-') as tmp:
    data = str(Path(tmp) / 'data')
    subprocess.run([str(PG/'initdb'), '-D', data, '-A', 'trust', '--no-locale', '--encoding=UTF8'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([str(PG/'pg_ctl'), '-D', data, '-l', str(Path(tmp)/'postgres.log'), '-o', f'-k {tmp} -p 55489 -c listen_addresses=', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    psql = [str(PG/'psql'), '-X', '-h', tmp, '-p', '55489', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq']

    def sql(query, check=True):
        return subprocess.run(psql, input=query, text=True, capture_output=True, check=check)

    def lock_lease():
        holder = subprocess.Popen(psql, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        holder.stdin.write('begin;\nselect id from entity_location_worker_lease for update;\n')
        holder.stdin.flush()
        for _ in range(100):
            ready = sql("select count(*) from pg_stat_activity where pid<>pg_backend_pid() and query='select id from entity_location_worker_lease for update;' and state='idle in transaction';").stdout.strip()
            if ready == '1':
                return holder
            if holder.poll() is not None:
                raise AssertionError('Lease holder exited before test')
            time.sleep(0.02)
        holder.communicate('rollback;\n', timeout=5)
        raise AssertionError('Lease holder did not acquire row')

    try:
        sql(schema + wake + contract)
        holder = lock_lease()
        try:
            blocked = sql("set statement_timeout='250ms';insert into jobs values(1,'pending');", check=False)
            assert blocked.returncode != 0 and 'statement timeout' in blocked.stderr, blocked
            assert sql('select count(*) from jobs;').stdout.strip() == '0'
        finally:
            holder.communicate('rollback;\n', timeout=5)
        sql(migration + migration)
        holder = lock_lease()
        try:
            sql("set statement_timeout='500ms';insert into jobs values(2,'pending');")
            assert sql('select count(*) from dispatches;').stdout.strip() == '0'
            assert sql("select status from jobs where id=2;").stdout.strip() == 'pending'
        finally:
            holder.communicate('rollback;\n', timeout=5)
        sql(r"""
insert into jobs values(3,'pending');
insert into jobs values(4,'pending');
do $$begin
 if (select count(*) from dispatches)<>1 then raise exception 'Eligible dispatch or debounce failed';end if;
 if exists(select 1 from dispatches where url<>'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/complete-entity-location'
  or body<>'{}'::jsonb or timeout_milliseconds<>55000 or headers->>'x-webhook-secret'<>'fixture-secret') then raise exception 'Webhook contract changed';end if;
end$$;
update entity_location_worker_lease set until_at=now()+interval '1 minute',dispatched_at='-infinity';
insert into jobs values(5,'pending');
do $$begin
 if (select count(*) from dispatches)<>1 then raise exception 'Active lease dispatched';end if;
 if (select count(*) from jobs where status='pending')<>4 then raise exception 'Queued jobs changed';end if;
 if exists((select proacl,proowner,prosecdef,proconfig from pg_proc where oid='wake_entity_location_worker()'::regprocedure
   except select * from original_contract)) then raise exception 'Function security changed';end if;
end$$;
""")
        print('PASS: old contention reproduced; locked lease skipped; pending jobs preserved; later dispatch, debounce, active lease and webhook/security contracts preserved; migration idempotent')
    finally:
        subprocess.run([str(PG/'pg_ctl'), '-D', data, '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
