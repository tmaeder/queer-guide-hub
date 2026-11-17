#!/usr/bin/env python3
"""Verify bounded Review cron recovery preserves pauses, custom actions and other jobs."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ['PG_BINDIR']) if os.environ.get('PG_BINDIR') else Path(shutil.which('pg_ctl') or '/missing').parent
patch = next((ROOT/'supabase/migrations').glob('*_register_review_cron_recovery.sql')).read_text()
seed = subprocess.run(['node', str(ROOT/'scripts/ci/seed-review-cron-migration.mjs')], env={**os.environ, 'DB_URL':'postgresql://127.0.0.1/postgres'}, text=True, check=True, capture_output=True).stdout
schema = r"""
create schema cron;
create table cron.job(jobid bigint generated always as identity,jobname text primary key,schedule text,command text,active boolean default true);
create function cron.schedule(p_name text,p_schedule text,p_command text)returns bigint language plpgsql as $$declare n bigint;begin
 insert into cron.job(jobname,schedule,command)values(p_name,p_schedule,p_command)
 on conflict(jobname)do update set schedule=excluded.schedule,command=excluded.command returning jobid into n;return n;
end$$;
insert into cron.job(jobname,schedule,command)values('unrelated','* * * * *','select 42');
create table other_jobs_before as select *from cron.job;
create table admin_automations(id uuid primary key default md5('review')::uuid,slug text unique,name text,managed_by text,trigger jsonb,action jsonb,enabled boolean,schedule text,updated_at timestamptz default now(),lifecycle_state text,consecutive_failures integer default 3);
-- SYNTHETIC_CI_SEED
create table controls_before as select id,to_jsonb(a)-array['action','updated_at']value from admin_automations a;
create table admin_review_repairs(entity_type text,entity_id uuid,reason text,previous_value jsonb,next_value jsonb);
create function admin_automation_effective_command(text,text)returns text language sql as 'select $2';
"""
schema = schema.replace('-- SYNTHETIC_CI_SEED', seed + seed)
paused = r"""
do $$begin
 if exists(select 1 from cron.job where jobname='review_automatic_resolution')then raise exception 'Paused job recreated';end if;
 if exists(select 1 from controls_before b join admin_automations a using(id)where b.value<>to_jsonb(a)-array['action','updated_at'])then raise exception 'Pause, schedule or counters changed';end if;
 if(select count(*)from admin_review_repairs)<>1 then raise exception 'Metadata audit missing or repeated';end if;
end$$;
update admin_automations set enabled=true,lifecycle_state='active',consecutive_failures=0;
"""
enabled = r"""
do $$begin
 if not exists(select 1 from cron.job where jobname='review_automatic_resolution'and schedule='0-59/5 * * * *'
  and command='set statement_timeout=''90s''; select public.run_review_automatic_resolution(200,false);'and active)then raise exception 'Bounded job not restored';end if;
 if(select count(*)from admin_review_repairs)<>2 then raise exception 'Cron audit missing or not idempotent';end if;
 if exists((select *from cron.job where jobname='unrelated'except select *from other_jobs_before))then raise exception 'Other jobs changed';end if;
end$$;
"""
temporary = patch.replace('do $recovery$', 'create function pg_temp.recover()returns void language plpgsql as $recovery$', 1)
custom = r"""
update admin_automations set action=jsonb_set(action,'{args,p_batch}','100');
do $$begin
 begin perform pg_temp.recover();raise exception 'Custom action accepted';
 exception when raise_exception then if sqlerrm not like 'Custom Review automation action%'then raise;end if;end;
 if(select count(*)from admin_review_repairs)<>2 then raise exception 'Custom action mutated';end if;
end$$;
"""
with tempfile.TemporaryDirectory(prefix='qg-review-cron-') as tmp:
    data = str(Path(tmp)/'data')
    subprocess.run([str(PG/'initdb'),'-D',data,'-A','trust','--no-locale','--encoding=UTF8'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(PG/'pg_ctl'),'-D',data,'-l',str(Path(tmp)/'postgres.log'),'-o',f'-k {tmp} -p 55493 -c listen_addresses=','-w','start'],check=True,stdout=subprocess.DEVNULL)
    try:
        subprocess.run([str(PG/'psql'),'-X','-h',tmp,'-p','55493','-d','postgres','-v','ON_ERROR_STOP=1'],input=schema+patch+patch+paused+patch+patch+enabled+temporary+custom,text=True,check=True)
        print('PASS: paused state and controls preserved; enabled missing job restored with original bounded command; custom action refused; other jobs preserved; audited and idempotent')
    finally:
        subprocess.run([str(PG/'pg_ctl'),'-D',data,'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
