#!/usr/bin/env python3
"""Actual relevance RPC + actual commit selector under concurrent/stale inputs."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
with tempfile.TemporaryDirectory(prefix='jev-relevance-pg-') as tmp:
    data, sock = Path(tmp) / 'data', Path(tmp) / 'sock'
    sock.mkdir()
    subprocess.run([str(PG / 'initdb'), '-D', str(data), '-A', 'trust', '--no-locale', '--encoding=UTF8'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'pg.log'), '-o', f'-k {sock} -p 55443 -h ""', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    def sql(query, fail=False):
        r = subprocess.run([str(PG / 'psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(sock), '-p', '55443', 'postgres'], input="set request.jwt.claims='{\"role\":\"service_role\"}';\n" + query, text=True, capture_output=True)
        if fail:
            assert r.returncode != 0, 'Invalid/unauthorized write succeeded'
        elif r.returncode:
            raise AssertionError(r.stderr)
        return r.stdout.strip()
    try:
        sql("create role anon;create role authenticated;create role service_role;create table ingestion_staging(id uuid primary key,target_table text default 'marketplace_listings',disposition text default 'pending',review_status text default 'auto',ai_validation_status text default 'approved',classification_result jsonb,ai_confidence_score numeric,error_message text,updated_at timestamptz default '2026-10-29T12:00:00Z',dedup_status text default 'unique',dedup_match_id uuid,pipeline_run_id uuid,created_at timestamptz default now(),normalized_data jsonb default '{}',enriched_data jsonb default '{}',raw_data jsonb default '{}');create table ingestion_events(staging_id uuid,stage text,new_status text,actor text,payload jsonb);")
        sql((ROOT / 'supabase/tests/fixtures/jev_marketplace_commit_baseline.sql').read_text())
        sql((ROOT / 'supabase/migrations/20261029223309_marketplace_relevance_direction_guard.sql').read_text())
        def insert():
            key = uuid.uuid4()
            sql(f"insert into ingestion_staging(id) values('{key}');")
            return key
        def record(key, value=True, decision='approve', timestamp='2026-10-29T12:00:00Z', fail=False):
            c = json.dumps({'lgbti_relevant': value, 'lgbti_relevance_score': 0.9 if value is True else 0.1}).replace("'", "''")
            return sql(f"select record_marketplace_relevance('{key}','{timestamp}','{c}'::jsonb,'{decision}');", fail=fail)
        key = insert()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            winners = list(pool.map(lambda _: record(key), range(8)))
        assert winners.count('t') == 1, 'Duplicate classifiers both applied'
        assert sql(f"select count(*) from ingestion_events where staging_id='{key}';") == '1'
        negative, uncertain, stale = insert(), insert(), insert()
        assert record(negative, False, 'reject') == 't'
        assert sql(f"select disposition from ingestion_staging where id='{negative}';") == 'rejected'
        assert record(uncertain, False, 'review') == 't'
        assert sql(f"select review_status from ingestion_staging where id='{uncertain}';") == 'pending_review'
        assert record(stale, timestamp='2020-01-01T00:00:00Z') == 'f'
        record(stale, False, 'approve', fail=True)
        record(stale, 'true', 'approve', fail=True)
        # An event failure must roll back the matching source classification.
        sql("create function fail_event()returns trigger language plpgsql as $$begin raise exception 'event unavailable';end$$;create trigger fail_event before insert on ingestion_events for each row execute function fail_event();")
        record(stale, fail=True)
        assert sql(f"select classification_result is null from ingestion_staging where id='{stale}';") == 't'
        sql('drop trigger fail_event on ingestion_events;')
        for role in ['anon', 'authenticated']:
            sql(f"set role {role}; select record_marketplace_relevance('{stale}','2026-10-29T12:00:00Z','{{\"lgbti_relevant\":true,\"lgbti_relevance_score\":0.9}}','approve');", fail=True)
        # Actual production commit function: none of these types may enter its
        # writer. No marketplace tables are mocked into approving them.
        sql('delete from ingestion_events;delete from ingestion_staging;')
        for c in [None, {}, {'lgbti_relevant': False}, {'lgbti_relevant': 'true'}, {'lgbti_relevant': 'false'}, {'lgbti_relevant': 1}]:
            key = insert()
            if c is not None:
                payload = json.dumps(c).replace("'", "''")
                sql(f"update ingestion_staging set classification_result='{payload}'::jsonb where id='{key}';")
        assert sql('select count(*) from commit_marketplace_staging_batch(50,null);') == '0'
        assert sql('select count(*) from ingestion_events;') == '0'
        # A real boolean positive still reaches the writer. Missing downstream
        # fixture dependencies intentionally produce its caught error outcome.
        key = insert()
        sql(f"update ingestion_staging set classification_result='{{\"lgbti_relevant\":true}}' where id='{key}';")
        assert sql('select action from commit_marketplace_staging_batch(50,null);') == 'error'
        sql("create table admin_automations(id uuid primary key,slug text,enabled boolean,last_run_at timestamptz,last_run_status text);create table admin_automation_runs(id bigserial primary key,automation_id uuid,automation_slug text,started_at timestamptz,finished_at timestamptz,status text,items_examined integer,items_changed integer,summary jsonb,error text);insert into admin_automations(id,slug,enabled)values(gen_random_uuid(),'marketplace_commit_drain',false);")
        sql((ROOT / 'supabase/migrations/20261029223724_marketplace_drain_bounded_outcomes.sql').read_text())
        assert json.loads(sql('select run_marketplace_commit_drain(1500);'))['reason'] == 'paused'
        sql("update admin_automations set enabled=true;delete from ingestion_events;delete from ingestion_staging;")
        # Deliberately stub only native outcomes to exercise the real wrapper's
        # cap, accounting and failure status independently from its writer.
        sql("create or replace function commit_marketplace_staging_batch(p_limit integer default 50,p_pipeline_run_id uuid default null)returns table(staging_id uuid,listing_id uuid,action text)language sql as $$select gen_random_uuid(),gen_random_uuid(),case when i%2=0 then 'updated' else 'error' end from generate_series(1,p_limit)i$$;")
        report = json.loads(sql('select run_marketplace_commit_drain(1500);'))
        assert report['batch'] == 50 and report['examined'] == 50
        assert report['committed'] == 25 and report['failed'] == 25
        assert sql('select items_changed from admin_automation_runs order by id desc limit 1;') == '25'
        sql("create or replace function commit_marketplace_staging_batch(p_limit integer default 50,p_pipeline_run_id uuid default null)returns table(staging_id uuid,listing_id uuid,action text)language sql as $$select gen_random_uuid(),null::uuid,'error'::text from generate_series(1,p_limit)i$$;")
        all_failed = json.loads(sql('select run_marketplace_commit_drain(10);'))
        assert all_failed['committed'] == 0 and all_failed['failed'] == 10
        assert sql('select status from admin_automation_runs order by id desc limit 1;') == 'error'
        assert json.loads(sql('select run_marketplace_commit_drain(0);'))['examined'] == 0
        print('PASS: actual drain wrapper preserves pause, caps 1500 to 50, counts actual outcomes and exposes all-failure runs')
        print('PASS: actual relevance RPC, eight concurrent classifiers, direction/type checks, stale refusal, atomic event rollback, role ACLs and actual native commit selector')
    finally:
        subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
