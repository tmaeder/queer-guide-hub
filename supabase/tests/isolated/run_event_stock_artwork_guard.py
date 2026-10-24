#!/usr/bin/env python3
"""Retire only event stock imagery; keep source-owned work and other image modes."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).parent

def binary(name):
    return str(Path(os.environ['PG_BINDIR']) / name) if os.environ.get('PG_BINDIR') else shutil.which(name)

schema = """
create schema api_private;create schema cron;
create table countries(id uuid primary key,name text,capital text,image_url text,duplicate_of_id uuid,population bigint);
create table cities(id uuid primary key,name text,country_id uuid,image_url text,duplicate_of_id uuid,population bigint);
create table venues(id uuid primary key default gen_random_uuid(),city_id uuid);
create table events(id uuid primary key,title text,city text,event_type text,images text[],duplicate_of_id uuid,start_date timestamptz,city_id uuid);
create table milestones(id uuid primary key,title text,city_id uuid,city_name text,country_id uuid,country_name text,date date,image_url text,sources jsonb,status text,duplicate_of_id uuid,image_metadata jsonb,category text,impact text,significance int);
create table enrichment_log(step text,entity_type text,entity_id uuid);
create table admin_automations(slug text primary key,name text,managed_by text,trigger jsonb,schedule text,enabled boolean default true,lifecycle_state text default 'active',can_run_now boolean default true,can_dry_run boolean default true,capability_reason text,action jsonb,updated_at timestamptz default now());
create table cron.job(jobid bigint primary key,jobname text unique,schedule text,active boolean default true,command text);
create function cron.schedule(text,text,text)returns bigint language sql as $$insert into cron.job(jobid,jobname,schedule,command)values((select coalesce(max(jobid),0)+1 from cron.job),$1,$2,$3)returning jobid$$;
create function cron.unschedule(bigint)returns boolean language sql as $$delete from cron.job where jobid=$1 returning true$$;
insert into countries values('00000000-0000-0000-0000-000000000001','Country','Capital',null,null,100);
insert into cities values('00000000-0000-0000-0000-000000000002','City','00000000-0000-0000-0000-000000000001',null,null,50);
insert into events values('00000000-0000-0000-0000-000000000003','Actual event','City',null,'{}',null,'2026-12-01','00000000-0000-0000-0000-000000000002');
insert into milestones values('00000000-0000-0000-0000-000000000004','Historic event',null,'City',null,'Country','1969-06-28',null,'[{"label":"Wikipedia","url":"https://en.wikipedia.org/wiki/Stonewall_riots"}]','published',null,'{}','history','positive',10);
insert into admin_automations(slug,action)select x,jsonb_build_object('jobname',x)from unnest(array['event_image_backfill','queer_image_backfill_event','queer_image_backfill','queer_image_backfill_country'])x;
insert into cron.job select n,x,'18 * * * *',true,'fixture-'||x from unnest(array['event_image_backfill','queer_image_backfill_event','queer_image_backfill','queer_image_backfill_country'])with ordinality as t(x,n);
"""
baseline = """
create table expected_modes as select mode,coalesce((select jsonb_agg(to_jsonb(r))from public.entities_due_for_queer_image(mode,40)r),'[]')result from unnest(array['city','country','milestone'])mode;
create table expected_schedules as select to_jsonb(j)row from cron.job j where jobname<>'queer_image_backfill_event';
create table expected_automations as select to_jsonb(a)row from admin_automations a where slug<>'queer_image_backfill_event';
create table expected_events as select to_jsonb(e)row from events e;
do $$begin assert(select count(*)from public.entities_due_for_queer_image('event',40))=1;end $$;
"""
assertions = """
do $test$
declare expected record;actual jsonb;lim int;
begin
 foreach lim in array array[0,1,40,200,100000]loop
  assert(select count(*)from public.entities_due_for_queer_image('event',lim))=0,'Retired event selector still returns candidates';
 end loop;
 for expected in select *from expected_modes loop
  select coalesce(jsonb_agg(to_jsonb(r)),'[]')into actual from public.entities_due_for_queer_image(expected.mode,40)r;
  assert actual=expected.result,'Unrelated image selector changed: '||expected.mode;
  assert jsonb_array_length(actual)=1,'Positive control selected nothing';
 end loop;
 assert not has_function_privilege('anon','public.entities_due_for_queer_image(text,integer)','execute');
 assert has_function_privilege('service_role','public.entities_due_for_queer_image(text,integer)','execute');
 assert(select enabled=false and lifecycle_state='consolidated'and not can_run_now and not can_dry_run from admin_automations where slug='queer_image_backfill_event');
 assert not exists(select 1 from cron.job where jobname='queer_image_backfill_event');
 assert(select jsonb_agg(to_jsonb(j)order by jobid)from cron.job j)=(select jsonb_agg(row order by(row->>'jobid')::bigint)from expected_schedules),'Other schedules changed';
 assert(select jsonb_agg(to_jsonb(a)order by slug)from admin_automations a where slug<>'queer_image_backfill_event')=(select jsonb_agg(row order by row->>'slug')from expected_automations),'Other registry rows changed';
 assert(select jsonb_agg(to_jsonb(e))from events e)=(select jsonb_agg(row)from expected_events),'Event facts or images changed';
 assert not exists(select 1 from enrichment_log),'Retirement fabricated processing';
end $test$;
"""
migration = (ROOT / 'supabase/migrations/99991792816500_event_owned_artwork_producer.sql').read_text()
selector = (HERE / 'queer_image_selector_fixture.sql').read_text()
with tempfile.TemporaryDirectory(prefix='qg-event-stock-guard-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale', '--wal-segsize=1'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'postgres.log'), '-o', f'-k {tmp} -p 55507 -c listen_addresses= -c min_wal_size=2MB -c max_wal_size=16MB', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run([binary('psql'), '-h', tmp, '-p', '55507', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input='create role anon;create role authenticated;create role service_role;', text=True, check=True, stdout=subprocess.DEVNULL)
        for mode in ['active', 'paused', 'missing_owner', 'snapshot_dependencies']:
            subprocess.run([binary('createdb'), '-h', tmp, '-p', '55507', mode], check=True)
            command = [binary('psql'), '-h', tmp, '-p', '55507', '-d', mode, '-v', 'ON_ERROR_STOP=1']
            setup = schema + selector
            if mode == 'snapshot_dependencies':
                setup += "delete from admin_automations where slug in ('event_image_backfill','queer_image_backfill_event');delete from cron.job where jobname in ('event_image_backfill','queer_image_backfill_event');"
                setup += subprocess.check_output(['node', str(ROOT / 'scripts/ci/seed-event-artwork-migration.mjs')], env={**os.environ, 'DB_URL': 'postgresql://127.0.0.1/postgres'}, text=True)
            setup += baseline
            if mode == 'paused':
                setup += "update admin_automations set enabled=false,lifecycle_state='paused'where slug='queer_image_backfill_event';delete from cron.job where jobname='queer_image_backfill_event';"
            if mode == 'missing_owner':
                setup += "update admin_automations set enabled=false where slug='event_image_backfill';"
            subprocess.run(command, input=setup, text=True, check=True, stdout=subprocess.DEVNULL)
            outcome = subprocess.run(command, input=migration + (assertions if mode != 'missing_owner' else ''), text=True, capture_output=True)
            if mode == 'missing_owner':
                assert outcome.returncode != 0 and 'Canonical event artwork producer is not active' in outcome.stderr
                subprocess.run(command, input="do $$begin assert(select count(*)from public.entities_due_for_queer_image('event',40))=1;assert(select enabled from admin_automations where slug='queer_image_backfill_event');assert exists(select 1 from cron.job where jobname='queer_image_backfill_event');end $$;", text=True, check=True, stdout=subprocess.DEVNULL)
            elif outcome.returncode:
                raise RuntimeError(outcome.stdout + outcome.stderr)
            print('PASS', mode)
    finally:
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
