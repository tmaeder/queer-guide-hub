#!/usr/bin/env python3
"""Exercise the real candidate indexes in a new disposable PostgreSQL cluster."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get('PG_BINDIR', '/opt/homebrew/opt/postgresql@17/bin'))

def binary(name):
    path = str(PG / name) if (PG / name).exists() else shutil.which(name)
    if not path:
        raise SystemExit(f'{name} missing; set PG_BINDIR')
    return path

migrations = list((ROOT / 'supabase/migrations').glob('*_staging_quality_score_candidate_indexes.sql'))
if len(migrations) != 1:
    raise SystemExit('Exactly one candidate-index migration required')
predicate = """dedup_status in('unique','pending') and ai_validation_status in('approved','pending')
 and ((enrichment_status='pending' and enriched_data->>'quality_score' is null)
 or (enrichment_status='enriched' and enriched_data->>'quality_status' is not null))"""
with tempfile.TemporaryDirectory(prefix='qg-staging-index-') as directory:
    data = Path(directory) / 'data'
    subprocess.run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(Path(directory) / 'server.log'),
                    '-o', f'-k {directory} -p 55488 -c listen_addresses=', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        def sql(source):
            return subprocess.run([binary('psql'), '-XAt', '-h', directory, '-p', '55488', '-d', 'postgres',
                                   '-v', 'ON_ERROR_STOP=1'], input=source, text=True, check=True, capture_output=True).stdout.strip()
        sql("""create table ingestion_staging(id bigint primary key,entity_type text,created_at timestamptz,
          dedup_status text,ai_validation_status text,enrichment_status text,enriched_data jsonb);
          insert into ingestion_staging select n,'event',now()-n*interval '1 second','unique','approved',
           'completed','{"quality_score":50}'::jsonb from generate_series(1,100000)n;
          insert into ingestion_staging values
           (100001,'event',now(),'unique','approved','pending','{}'),
           (100002,'event',now(),'unique','approved','pending','{"quality_score":null}'),
           (100003,'event',now(),'pending','pending','enriched','{"quality_status":"ready"}'),
           (100004,'event',now(),'unique','approved','enriched','{}'),
           (100005,'event',now(),'unique','approved','pending','{"quality_score":0}'),
           (100006,'event',now(),'unique','approved','failed','{}'),
           (100007,'event',now(),'duplicate','approved','pending','{}'),
           (100008,'event',now(),'unique','rejected','pending','{}'),
           (100009,'venue',now(),'unique','approved','pending','{}');
          insert into ingestion_staging select 200000+n,'venue',now()-interval '1 day',
           'unique','approved','pending','{}'::jsonb from generate_series(1,10000)n;
          analyze ingestion_staging;""")
        before = sql(f'select array_agg(id order by id) from ingestion_staging where {predicate}')
        controls = sql(f'select array_agg(id order by id) from ingestion_staging where ({predicate}) and id<200000')
        if controls != '{100001,100002,100003,100009}':
            raise AssertionError(controls)
        sql('begin;\n' + migrations[0].read_text() + '\ncommit; analyze ingestion_staging;')
        after = sql(f'select array_agg(id order by id) from ingestion_staging where {predicate}')
        if before != after:
            raise AssertionError('Index changed candidate membership')
        for scoped in (False, True):
            query = f'select * from ingestion_staging where {predicate}'
            if scoped:
                query += " and entity_type='event'"
            plan = json.loads(sql('explain (analyze,buffers,format json) ' + query + ' order by created_at limit 50'))[0]
            def indexes(node):
                return ([node['Index Name']] if 'Index Name' in node else []) + [name for child in node.get('Plans', []) for name in indexes(child)]
            expected = 'ingestion_staging_quality_candidates_' + ('domain' if scoped else 'created') + '_idx'
            if expected not in indexes(plan['Plan']):
                raise AssertionError(plan)
            print(json.dumps({'scoped': scoped, 'index': expected, 'execution_ms': plan['Execution Time']}))
        sql("update ingestion_staging set enrichment_status='completed' where id=100003")
        if sql(f'select count(*) from ingestion_staging where {predicate}') != '10003':
            raise AssertionError('Candidate index did not follow status transition')
        print('PASS: membership, both live query shapes and state transitions')
    finally:
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
