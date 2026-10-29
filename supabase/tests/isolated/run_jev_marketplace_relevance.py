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
        jev_events_migration = (ROOT / 'supabase/migrations/20261029225917_jev_marketplace_relevance_events.sql').read_text()
        sql(jev_events_migration)
        sql(jev_events_migration)
        sql("alter table ingestion_staging add source_name text default 'ohmyfantasy',add entity_type text default 'marketplace';create table admin_review_decisions(queue_key text,item_id uuid,actor_kind text);")
        sql((ROOT / 'supabase/migrations/20261029230831_marketplace_relevance_protected_candidates.sql').read_text())
        def insert():
            key = uuid.uuid4()
            sql(f"insert into ingestion_staging(id) values('{key}');")
            return key
        def record(key, value=True, decision='approve', timestamp='2026-10-29T12:00:00Z', fail=False, classifier='legacy_cf_validated_v2'):
            c = json.dumps({'lgbti_relevant': value, 'lgbti_relevance_score': 0.9 if value is True else 0.1, 'classifier': classifier}).replace("'", "''")
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
        deferred = insert()
        assert record(deferred, None, 'review', classifier='jev-product-relevance-v1') == 't'
        assert sql(f"select classification_result->'lgbti_relevant'='null'::jsonb from ingestion_staging where id='{deferred}';") == 't'
        assert sql(f"select stage from ingestion_events where staging_id='{deferred}';") == 'relevance_jev'
        record(stale, None, 'approve', fail=True)
        record(stale, None, 'reject', fail=True)
        sql(f"select record_marketplace_relevance('{stale}','2026-10-29T12:00:00Z','{{\"lgbti_relevance_score\":0.9}}','review');", fail=True)
        protected = insert()
        sql(f"insert into admin_review_decisions values('staging','{protected}','staff');")
        assert record(protected) == 'f', 'Staff approval was overwritten during inference'
        assert sql(f"select classification_result is null from ingestion_staging where id='{protected}';") == 't'
        # An event failure must roll back the matching source classification.
        sql("create function fail_event()returns trigger language plpgsql as $$begin raise exception 'event unavailable';end$$;create trigger fail_event before insert on ingestion_events for each row execute function fail_event();")
        record(stale, fail=True)
        assert sql(f"select classification_result is null from ingestion_staging where id='{stale}';") == 't'
        sql('drop trigger fail_event on ingestion_events;')
        for role in ['anon', 'authenticated']:
            sql(f"set role {role}; select record_marketplace_relevance('{stale}','2026-10-29T12:00:00Z','{{\"lgbti_relevant\":true,\"lgbti_relevance_score\":0.9}}','approve');", fail=True)
            sql(f"set role {role}; select marketplace_relevance_candidates();", fail=True)
        # Actual production commit function: none of these types may enter its
        # writer. No marketplace tables are mocked into approving them.
        sql('delete from ingestion_events;delete from ingestion_staging;')
        for c in [None, {}, {'lgbti_relevant': None}, {'lgbti_relevant': False}, {'lgbti_relevant': 'true'}, {'lgbti_relevant': 'false'}, {'lgbti_relevant': 1}]:
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
        sql('delete from ingestion_events;delete from ingestion_staging;delete from admin_review_decisions;')
        protected, oldest, newest, unrelated = insert(), insert(), insert(), insert()
        sql(f"update ingestion_staging set created_at='2020-01-01' where id='{protected}';update ingestion_staging set created_at='2021-01-01',raw_data='{{\"title\":\"Public title\",\"description\":\"Public original text\",\"email\":\"PRIVATE_CONTACT\",\"submitted_by\":\"PRIVATE_USER\"}}' where id='{oldest}';update ingestion_staging set created_at='2022-01-01',source_name='autostraddle' where id='{newest}';update ingestion_staging set source_name='unrelated-source' where id='{unrelated}';insert into admin_review_decisions values('staging','{protected}','staff');")
        selected = json.loads(sql("select marketplace_relevance_candidates(1,null,'{}',true,false);"))
        assert selected[0]['id'] == str(oldest), 'Protected old item starved the ready candidate'
        assert 'PRIVATE_' not in json.dumps(selected)
        assert json.loads(sql("select marketplace_relevance_candidates(1,null,'{}',true,true);"))[0]['id'] == str(newest)
        assert json.loads(sql("select marketplace_relevance_candidates(1,null,array['autostraddle'],true,false);"))[0]['id'] == str(newest)
        assert json.loads(sql(f"select marketplace_relevance_candidates(100,'{uuid.uuid4()}','{{}}',false,false);")) == []
        print('PASS: protected source selection before limit, oldest/newest source scopes, raw metadata minimization and staff-decision race refusal')
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
        sql("alter table admin_automations add action jsonb default '{}',add schedule text,add updated_at timestamptz default now();alter table ingestion_staging add target_record_id uuid;create table marketplace_listings(id uuid primary key,lgbti_relevance_score numeric,sensitivity_flags jsonb,status text default 'active',classified_at timestamptz,updated_at timestamptz);create schema cron;create table cron.job(jobid bigint primary key,jobname text,command text,active boolean,schedule text);create function cron.alter_job(job_id bigint,command text)returns void language sql as $$update cron.job set command=$2 where jobid=$1$$;create function admin_automation_effective_command(text,text)returns text language sql as $$select $2$$;")
        old_command = (ROOT / 'supabase/tests/fixtures/jev_marketplace_propagation_baseline.sql').read_text()
        escaped = old_command.replace("'", "''")
        sql(f"insert into admin_automations(id,slug,enabled,action,schedule)values(gen_random_uuid(),'mp_drain_propagate',true,jsonb_build_object('type','cron','jobname','mp-drain-propagate','command','{escaped}'),'50 * * * *');insert into cron.job values(1,'mp-drain-propagate','{escaped}',true,'50 * * * *');")
        migration = (ROOT / 'supabase/migrations/20261029231857_marketplace_propagation_positive_guard.sql').read_text()
        sql(migration)
        sql(migration)
        command = sql("select action->>'command' from admin_automations where slug='mp_drain_propagate';")
        assert sql("select command from cron.job where jobid=1;") == command
        assert sql("select enabled from admin_automations where slug='mp_drain_propagate';") == 't'
        sql('delete from ingestion_staging;')
        listings = [uuid.uuid4() for _ in range(8)]
        for i, lid in enumerate(listings):
            existing_score = '0.66' if i == 4 else 'null'
            sql(f"insert into marketplace_listings(id,lgbti_relevance_score)values('{lid}',{existing_score});")
            c = {'lgbti_relevant': None if i == 1 else False if i == 2 else 'true' if i == 3 else True,
                 'lgbti_relevance_score': 'invalid' if i == 7 else 0.9, 'sensitivity_flags': []}
            key = insert()
            disposition = 'rejected' if i == 2 else 'pending' if i == 1 else 'committed'
            review_status = 'pending_review' if i in [1, 5] else 'approved'
            payload = json.dumps(c).replace("'", "''")
            sql(f"update ingestion_staging set target_record_id='{lid}',classification_result='{payload}',disposition='{disposition}',review_status='{review_status}',updated_at='2026-01-01' where id='{key}';")
            if i == 6:
                # A newer unresolved judgment prevents fallback to an old positive.
                other = insert()
                sql(f"update ingestion_staging set target_record_id='{lid}',classification_result='{{\"lgbti_relevant\":null,\"lgbti_relevance_score\":0.99}}',review_status='pending_review',updated_at='2026-10-29' where id='{other}';")
        sql(command)
        for i, lid in enumerate(listings):
            observed = json.loads(sql(f"select jsonb_build_object('score',lgbti_relevance_score,'status',status) from marketplace_listings where id='{lid}';"))
            assert observed['status'] == 'active', 'Model propagation deactivated a listing'
            assert observed['score'] == (0.9 if i == 0 else 0.66 if i == 4 else None), f'Unsafe score propagation: case {i}'
        print('PASS: real propagation command only fills qualified empty scores, preserves status/human values, holds latest uncertainty, rejects malformed metadata and keeps registry/cron synchronized')
        print('PASS: actual relevance RPC, eight concurrent classifiers, direction/type checks, stale refusal, atomic event rollback, role ACLs and actual native commit selector')
    finally:
        subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
