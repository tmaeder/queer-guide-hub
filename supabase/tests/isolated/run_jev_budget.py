#!/usr/bin/env python3
"""Exercise real Jev cap and pipeline-shadow migrations, concurrency and ACLs."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
MAXIMUM = 2_752_512
with tempfile.TemporaryDirectory(prefix='jev-budget-pg-') as tmp:
    data = Path(tmp) / 'data'
    sock = Path(tmp) / 'sock'
    sock.mkdir()
    subprocess.run([str(PG / 'initdb'), '-D', str(data), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'pg.log'), '-o', f'-k {sock} -p 55440 -h ""', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    def sql(query, fail=False):
        query = "set request.jwt.claims='{\"role\":\"service_role\"}';\n" + query
        result = subprocess.run([str(PG / 'psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(sock), '-p', '55440', 'postgres'], input=query, text=True, capture_output=True)
        if fail:
            assert result.returncode != 0, 'Unauthorized/invalid operation succeeded'
        elif result.returncode:
            raise AssertionError(result.stderr)
        return result.stdout.strip()
    def reserve(account, request_id, caller='synthetic-test'):
        return sql(f"select public.reserve_jev_budget('{account}','{request_id}','{caller}',repeat('a',64));") == 't'
    def status(account):
        return json.loads(sql(f"select public.get_jev_budget_status('{account}');"))
    try:
        sql('create role anon; create role authenticated; create role service_role;')
        sql((ROOT / 'supabase/migrations/20261029213554_jev_shared_budget_ledger.sql').read_text())
        sql((ROOT / 'supabase/migrations/20261029215343_jev_monthly_production_budget.sql').read_text())
        assert status('validation-2026-10-29')['cap_nano_usd'] == 5_000_000_000
        assert status('validation-2026-10-29')['period'] == 'lifetime'
        assert status('production')['cap_nano_usd'] == 25_000_000_000
        assert status('production')['period'] == 'month'
        assert status('production')['period_start'].endswith('-01')
        sql(f"select public.reserve_jev_budget('unknown','{uuid.uuid4()}','test',repeat('a',64));", fail=True)
        sql(f"insert into api_private.jev_budget_accounts values('concurrent',{2 * MAXIMUM},'lifetime',true);")
        request_ids = [uuid.uuid4() for _ in range(12)]
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            allowed = list(pool.map(lambda pair: reserve('concurrent', pair[1], f'caller-{pair[0]}'), enumerate(request_ids)))
        assert sum(allowed) == 2, 'Concurrent workers exceeded cap'
        winners = [key for key, ok in zip(request_ids, allowed) if ok]
        assert status('concurrent')['reserved_nano_usd'] == 2 * MAXIMUM
        assert not reserve('concurrent', winners[0]), 'One reservation authorized two attempts'
        assert sql(f"select public.settle_jev_budget('concurrent','{winners[0]}',100);") == 't'
        assert sql(f"select public.settle_jev_budget('concurrent','{winners[0]}',100);") == 't'
        sql(f"select public.settle_jev_budget('concurrent','{winners[0]}',0);", fail=True)
        sql(f"select public.settle_jev_budget('concurrent','{winners[1]}',null);")
        s = status('concurrent')
        assert s['charged_nano_usd'] == MAXIMUM + 4200 and s['reserved_nano_usd'] == 0
        assert not reserve('concurrent', uuid.uuid4()), 'Cap ignored previous charges'
        assert sql(f"select public.settle_jev_budget('wrong-account','{winners[0]}',100);") == 'f'
        sql(f"select public.settle_jev_budget('concurrent','{winners[1]}',65537);", fail=True)
        sql("update api_private.jev_budget_accounts set enabled=false where account='validation-2026-10-29';")
        assert not reserve('validation-2026-10-29', uuid.uuid4())
        # A response crossing midnight settles the original window, never today's window.
        sql(f"insert into api_private.jev_budget_accounts values('daily',{2 * MAXIMUM},'day',true);")
        old_id = uuid.uuid4()
        sql(f"insert into api_private.jev_budget_windows values('daily',date '2020-01-01',0,{MAXIMUM}); insert into api_private.jev_budget_reservations(request_id,account,period_start,caller,request_hash,reserved_nano_usd) values('{old_id}','daily',date '2020-01-01','test',repeat('b',64),{MAXIMUM});")
        assert reserve('daily', uuid.uuid4())
        sql(f"select public.settle_jev_budget('daily','{old_id}',null);")
        assert status('daily')['charged_nano_usd'] == 0
        assert status('daily')['reserved_nano_usd'] == MAXIMUM
        # A late settlement from a prior month must not consume this month's cap.
        prior_month_id = uuid.uuid4()
        sql(f"insert into api_private.jev_budget_windows values('production',date '2020-01-01',0,{MAXIMUM}); insert into api_private.jev_budget_reservations(request_id,account,period_start,caller,request_hash,reserved_nano_usd) values('{prior_month_id}','production',date '2020-01-01','test',repeat('b',64),{MAXIMUM});")
        assert reserve('production', uuid.uuid4())
        sql(f"select public.settle_jev_budget('production','{prior_month_id}',null);")
        assert status('production')['charged_nano_usd'] == 0
        assert status('production')['reserved_nano_usd'] == MAXIMUM
        for role in ['anon', 'authenticated']:
            sql(f"set role {role}; select public.get_jev_budget_status('daily');", fail=True)
            sql(f"set role {role}; select public.reserve_jev_budget('daily','{uuid.uuid4()}','test',repeat('a',64));", fail=True)
            sql(f"set role {role}; select * from api_private.jev_budget_accounts;", fail=True)
        sql("set role service_role; set request.jwt.claims='{\"role\":\"authenticated\"}'; select public.get_jev_budget_status('daily');", fail=True)
        assert 'configured' in sql("set role service_role; set request.jwt.claims='{\"role\":\"service_role\"}'; select public.get_jev_budget_status('daily');")
        sql((ROOT / 'supabase/migrations/20261029220732_jev_pipeline_shadow.sql').read_text())
        staging_id = uuid.uuid4()
        def claim(token, hash_char='c', policy='shadow-v1'):
            return sql(f"select public.claim_jev_pipeline_check('{staging_id}',repeat('{hash_char}',64),'jev-1.14.0','{policy}','{token}','rss-news','news_article');") == 't'
        tokens = [uuid.uuid4() for _ in range(12)]
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            claims = list(pool.map(claim, tokens))
        assert sum(claims) == 1, 'Concurrent shadow workers repeated unchanged input'
        winning_token = tokens[claims.index(True)]
        def finish(token, verdict='supported', answers="'{\"faithful\":{\"type\":\"noul\",\"noul\":1}}'::jsonb", usage='100', fail=False):
            return sql(f"select public.finish_jev_pipeline_check('{staging_id}',repeat('c',64),'jev-1.14.0','shadow-v1','{token}','{verdict}',{answers},{usage});", fail=fail)
        assert finish(uuid.uuid4()) == 'f', 'Wrong shadow lease completed'
        finish(winning_token, verdict='approved', fail=True)
        finish(winning_token, answers="'{}'::jsonb", fail=True)
        assert finish(winning_token) == 't'
        assert finish(winning_token) == 'f', 'Completed audit was overwritten'
        assert not claim(uuid.uuid4()), 'Unchanged complete input was re-evaluated'
        assert claim(uuid.uuid4(), hash_char='d'), 'Changed evidence did not invalidate cache'
        assert claim(uuid.uuid4(), policy='shadow-v2'), 'Changed policy did not invalidate cache'
        sql("update api_private.jev_pipeline_checks set expires_at=now()-interval '1 second' where input_hash=repeat('c',64) and policy_version='shadow-v1';")
        replacement = uuid.uuid4()
        assert claim(replacement), 'Expired shadow entry could not be rechecked'
        assert finish(winning_token) == 'f', 'Expired lease overwrote the new worker'
        assert finish(replacement, verdict='error', answers="'{}'::jsonb", usage='null') == 't'
        assert not claim(uuid.uuid4()), 'Error retry backoff was ignored'
        for role in ['anon', 'authenticated']:
            sql(f"set role {role}; select public.claim_jev_pipeline_check('{staging_id}',repeat('c',64),'jev-1.14.0','shadow-v1','{uuid.uuid4()}','rss-news','news_article');", fail=True)
            sql(f"set role {role}; select public.finish_jev_pipeline_check('{staging_id}',repeat('c',64),'jev-1.14.0','shadow-v1','{replacement}','error','{{}}'::jsonb,null);", fail=True)
            sql(f"set role {role}; select * from api_private.jev_pipeline_checks;", fail=True)
        print('PASS: pipeline shadow concurrent leases, unchanged-input cache, evidence/policy invalidation, expiry, stale lease rejection, retry backoff and client ACLs')
        sql("create table public.pipeline_definitions(id uuid primary key,name text,nodes jsonb,edges jsonb,updated_at timestamptz); insert into public.pipeline_definitions values(gen_random_uuid(),'tags-ingestion','[{\"id\":\"dedupe\",\"type\":\"pipeline-deduplicate\",\"data\":{\"config\":{\"batch_size\":500}}},{\"id\":\"commit\",\"type\":\"pipeline-commit\"}]','[{\"id\":\"e5\",\"source\":\"dedupe\",\"target\":\"commit\",\"animated\":true}]',now());")
        tag_migration = (ROOT / 'supabase/migrations/20261029220927_tags_shared_review_gate.sql').read_text()
        sql(tag_migration)
        first = json.loads(sql("select jsonb_build_object('nodes',nodes,'edges',edges) from pipeline_definitions;"))
        sql(tag_migration)
        assert first == json.loads(sql("select jsonb_build_object('nodes',nodes,'edges',edges) from pipeline_definitions;")), 'Tags gate migration not idempotent'
        assert sum(n['type'] == 'pipeline-review-gate' for n in first['nodes']) == 1
        assert first['nodes'][0]['data']['config']['batch_size'] == 500
        assert first['nodes'][-1]['data']['config']['entityType'] == 'tag'
        assert first['edges'][0]['animated'] is True
        assert not any(e['source'] == 'dedupe' and e['target'] == 'commit' for e in first['edges'])
        assert any(e['source'] == 'dedupe' and e['target'] == 'jev-review-gate' for e in first['edges'])
        assert any(e['source'] == 'jev-review-gate' and e['target'] == 'commit' for e in first['edges'])
        print('PASS: tags DAG gate routing, configuration/edge metadata preservation and idempotency')
        sql("create type public.app_role as enum('admin'); create function public.has_role_jwt(public.app_role) returns boolean language sql as $$select coalesce(current_setting('request.jwt.claims',true)::jsonb->>'app_role','')='admin'$$; create table public.admin_automations(slug text,enabled boolean); insert into public.admin_automations values('review_jev',true); create table public.admin_review_cases(id uuid,active boolean,fingerprint text); create table public.admin_review_automation_jobs(case_id uuid,status text,fingerprint text);")
        sql((ROOT / 'supabase/migrations/20261029221113_jev_review_budget_visibility.sql').read_text())
        admin_status = json.loads(sql("set role authenticated; set request.jwt.claims='{\"role\":\"authenticated\",\"app_role\":\"admin\"}'; select public.get_jev_review_status();"))
        assert admin_status['production_budget']['cap_nano_usd'] == 25_000_000_000
        assert admin_status['production_budget']['period'] == 'month'
        assert admin_status['production_budget']['reserved_nano_usd'] == MAXIMUM
        assert not admin_status['production_budget']['deferred']
        sql("set role authenticated; set request.jwt.claims='{\"role\":\"authenticated\"}'; select public.get_jev_review_status();", fail=True)
        sql("set role anon; select public.get_jev_review_status();", fail=True)
        sql("update api_private.jev_budget_accounts set enabled=false where account='production';")
        assert json.loads(sql("set role authenticated; set request.jwt.claims='{\"role\":\"authenticated\",\"app_role\":\"admin\"}'; select public.get_jev_review_status();"))['production_budget']['deferred']
        print('PASS: admin-only budget visibility, charged/reserved usage and disabled-budget deferral')
        print('PASS: real migration, lifetime $5 cap, 12 concurrent workers, reservation replay refusal, exact/unknown charges, idempotent settlement, disabled account, midnight rollover, RLS/ACL and actor checks')
    finally:
        subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
