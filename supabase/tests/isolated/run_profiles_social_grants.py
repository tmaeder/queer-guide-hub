#!/usr/bin/env python3
"""Run the exact pending grant migration under the CLI's distinct login/SET ROLE."""
import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
MIGRATION = ROOT / 'supabase/migrations/99991793214012_profiles_grant_social_links_update.sql'
SCHEMA = """
create role authenticated;
create role migration_owner;
create role cli_login login noinherit;
grant authenticated to migration_owner;
grant migration_owner to cli_login;
grant create on schema public to migration_owner;
create schema auth authorization migration_owner;
create schema supabase_migrations authorization migration_owner;
set role migration_owner;
create function auth.uid() returns uuid language sql stable as $$
 select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
grant usage on schema auth to authenticated;
create table public.profiles(user_id uuid primary key,social_links jsonb,social_accounts jsonb,bio text);
create table public.probe_trigger_effects(id bigint generated always as identity);
create function public.probe_profile_effect() returns trigger language plpgsql security definer as $$
begin insert into public.probe_trigger_effects default values;return new;end$$;
create trigger probe_effect after update on public.profiles for each row execute function public.probe_profile_effect();
alter table public.profiles enable row level security;
create policy own_read on public.profiles for select to authenticated using(user_id=auth.uid());
create policy own_write on public.profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select(user_id,social_links) on public.profiles to authenticated;
grant update(bio) on public.profiles to authenticated;
insert into public.profiles values(md5('local-owner')::uuid,'{"website":"https://example.test"}','[]','Local fixture');
create table supabase_migrations.schema_migrations(version text primary key);
reset role;
"""
PREFIX = """begin;
set session authorization cli_login;
set role migration_owner;
select set_config('request.jwt.claims','{"fixture":"original"}',true);
"""
ROLE_CHECK = """
do $$begin
 if current_user<>'migration_owner' or session_user<>'cli_login'
 then raise exception 'Migration changed the CLI effective/login role';end if;
 if current_setting('request.jwt.claims',true)<>'{"fixture":"original"}'
 then raise exception 'Probe leaked the profile-owner JWT';end if;
end$$;
"""
HISTORY = "insert into supabase_migrations.schema_migrations values('99991793214012');\ncommit;"
CHECKS = """
do $$begin
 if(select count(*) from public.probe_trigger_effects)<>0
 then raise exception 'Probe committed trigger effects';end if;
 if(select social_links from public.profiles)<>'{"website":"https://example.test"}'::jsonb
 or(select social_accounts from public.profiles)<>'[]'::jsonb
 then raise exception 'Probe changed the native profile';end if;
 if(select count(*) from supabase_migrations.schema_migrations)<>1
 then raise exception 'CLI did not record exactly one migration';end if;
 if not has_column_privilege('authenticated','public.profiles','social_accounts','UPDATE')
 or has_column_privilege('authenticated','public.profiles','social_accounts','SELECT')
 then raise exception 'Grant/privacy contract changed';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix='profile-grant-cli-pg-') as temporary:
    data, sock = Path(temporary) / 'data', Path(temporary) / 'sock'
    sock.mkdir()
    subprocess.run([str(PG / 'initdb'), '-D', str(data), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-l', str(Path(temporary) / 'pg.log'), '-o', f'-k {sock} -p 55448 -h ""', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        command = [str(PG / 'psql'), '-h', str(sock), '-p', '55448', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1']
        def run(sql):
            return subprocess.run(command, input=sql, text=True, capture_output=True)
        def success(sql):
            result = run(sql)
            if result.returncode:
                raise AssertionError(result.stderr)
            return result
        success(SCHEMA)
        fixed = MIGRATION.read_text()
        anchor = '    if not v_update_ok then'
        if fixed.count(anchor) != 1:
            raise AssertionError('Expected one successful-probe contract')
        broken = fixed.replace(anchor, '    reset role;\n' + anchor)
        control = run(PREFIX + broken + HISTORY)
        if control.returncode == 0 or 'permission denied for schema supabase_migrations' not in control.stderr:
            raise AssertionError('Old RESET ROLE did not reproduce the real CLI history failure: ' + control.stderr)
        success("set role migration_owner;alter policy own_write on public.profiles using(false);reset role;")
        denied = run(PREFIX + fixed + HISTORY)
        if denied.returncode == 0 or 'P5 failed: authenticated still cannot write' not in denied.stderr:
            raise AssertionError('RLS-denied zero-row probe incorrectly succeeded: ' + denied.stderr)
        success("set role migration_owner;alter policy own_write on public.profiles using(user_id=auth.uid());reset role;")
        result = success(PREFIX + fixed + ROLE_CHECK + HISTORY)
        if 'P5 skipped' in result.stderr:
            raise AssertionError('The behavioural profile probe did not execute')
        success(CHECKS)
        print('PASS: original RESET ROLE reproduces CLI history failure; corrected migration preserves effective role/JWT, records once, commits no profile/trigger effects and rejects an RLS-denied zero-row probe')
    finally:
        subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
