#!/usr/bin/env python3
"""Exercise historical source outcomes in a disposable cluster, never an existing DB."""
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
create role anon;create role authenticated;create role service_role;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
create function assert_admin_or_internal() returns void language sql as 'select';
create function dedup_despace(t text) returns text language sql immutable as
 'select regexp_replace(lower(t),''[^[:alnum:]]'','''',''g'')';
create table events(id uuid primary key,title text,external_id text,description text,start_date timestamptz,
 end_date timestamptz,status text default 'active',duplicate_of_id uuid,quality_score int default 42);
create table event_sources(id uuid primary key,event_id uuid,source_slug text,source_entity_id text,
 source_url text,payload_hash text,payload jsonb,last_seen_at timestamptz default now());
create table event_quality_issues(id uuid primary key default gen_random_uuid(),event_id uuid,issue_code text,
 severity text default 'medium',dimension text default 'completeness',detector text default 'event-quality-scan',
 status text default 'open',resolution text,reviewed_by uuid,reviewed_at timestamptz,resolved_at timestamptz,
 evidence_hash text,evidence jsonb,detected_at timestamptz);
create table event_quality_current(event_id uuid primary key,open_issue_codes text[],overall_score int default 42);
-- Existing internal assertion and native acceptance contract are stubbed here;
-- the real RPC was separately exercised against production inside a rollback.
create function decide_event_quality_issue(p_issue_id uuid,p_decision text,p_note text) returns void
 language plpgsql as $stub$ declare eid uuid;begin
 assert p_decision='accepted' and nullif(btrim(p_note),'') is not null;
 assert not exists(select 1 from event_quality_issues where id=p_issue_id and severity='critical');
 update event_quality_issues set status=p_decision,resolution=p_note,reviewed_at=now(),reviewed_by=auth.uid()
 where id=p_issue_id and status='open' returning event_id into eid;
 assert eid is not null,'No open issue';
 update event_quality_current set open_issue_codes=coalesce((select array_agg(issue_code order by issue_code)
 from event_quality_issues where event_id=eid and status='open'),'{}') where event_id=eid;
 end $stub$;
create function run_event_quality_repairs(p_batch integer,p_dry_run boolean) returns jsonb language plpgsql as $stub$
declare r record;v_candidates int:=0;v_changed int:=0;v_update jsonb;
begin
 perform public.assert_admin_or_internal();
 for r in select distinct e.* from public.events e where false loop null;end loop;
 return jsonb_build_object('dry_run',p_dry_run,'candidates',v_candidates,'changed',v_changed);
end $stub$;
"""
paths = list((ROOT / 'supabase/migrations').glob('*_historical_event_source_copy_outcomes.sql'))
if len(paths) != 1:
    raise SystemExit('Exactly one historical source brevity migration required')
sql = schema + paths[0].read_text() + (Path(__file__).parent / 'historical_event_brevity.sql').read_text()
with tempfile.TemporaryDirectory(prefix='qg-event-brevity-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'postgres.log'),
                    '-o', f'-k {tmp} -p 55489 -c listen_addresses=', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run([binary('psql'), '-h', tmp, '-p', '55489', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
                       input=sql, text=True, check=True)
    finally:
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
