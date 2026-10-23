#!/usr/bin/env python3
"""Exercise registered source limits in a disposable cluster, never an existing DB."""
import ast
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).parent


def binary(name):
    found = str(Path(os.environ['PG_BINDIR']) / name) if os.environ.get('PG_BINDIR') else shutil.which(name)
    if not found:
        raise SystemExit(f'{name} missing; set PG_BINDIR')
    return found


# Reuse the historical-source fixture's schema without executing its driver.
tree = ast.parse((HERE / 'run_historical_event_brevity.py').read_text())
schema = next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign)
              and any(isinstance(target, ast.Name) and target.id == 'schema' for target in node.targets))
schema += """
create schema api_private;create schema extensions;create extension dblink;
create extension pgcrypto with schema extensions;create extension unaccent with schema extensions;
alter table events add column images text[] default '{}',add column updated_at timestamptz default now(),
 add column field_provenance jsonb default '{}',add column last_verified_at timestamptz default now(),
 add column created_by uuid default gen_random_uuid(),add column seo_indexable boolean default true;
alter table event_sources add foreign key(event_id)references events(id);
alter table event_quality_issues add column last_seen_at timestamptz default now();
create unique index fixture_open_issue on event_quality_issues(event_id,issue_code)where status='open';
alter table event_quality_current add column rubric_version int,add column event_scope text,
 add column completeness_score int,add column validity_score int,add column linkage_score int,
 add column provenance_score int,add column media_score int,add column freshness_score int,
 add column quality_tier text,add column issue_codes text[],add column blocker_codes text[],
 add column assessed_at timestamptz,add column input_updated_at timestamptz,add column details jsonb;
create table event_quality_signals(event_id uuid,signal_type text,value integer,source text,details jsonb,
 created_at timestamptz default now());
create table event_image_quality_observations(event_id uuid,image_url text,http_status int,mime_type text,
 probe_status text,failure_reason text,checked_at timestamptz default now());
create table content_revisions(source_table text,source_id uuid,actor_kind text,changed_fields text[]);
create table dedup_review_queue(entity_type text,status text,keep_id uuid,drop_id uuid,created_at timestamptz);
create table event_quality_description_clusters(refreshed_at timestamptz);
create table event_quality_image_clusters(refreshed_at timestamptz);
-- Deliberate physical-assessment fixture: missing artwork remains a media gap
-- after source acceptance. The real scanner and decision RPC below are loaded
-- directly from the committed programme, not reproduced by this test.
create function compute_event_quality(eid uuid)returns jsonb language sql stable as $stub$
 select jsonb_build_object('rubric_version',1,'event_scope','historical','completeness_score',42,
 'validity_score',42,'linkage_score',42,'provenance_score',42,'freshness_score',42,'overall_score',42,
 'media_score',case when coalesce(cardinality(images),0)=0 then 0 else 42 end,
 'quality_tier','needs_enrichment','issue_codes',case when coalesce(cardinality(images),0)=0
 then '["IMAGE_MISSING"]'::jsonb else '[]'::jsonb end,'blocker_codes','[]'::jsonb)from events where id=eid
 $stub$;
create function event_quality_findings(eid uuid)returns table(dimension text,issue_code text,severity text,evidence jsonb)
 language sql stable as $stub$ select 'media','IMAGE_MISSING','medium','{"image_count":0}'::jsonb from events
 where id=eid and coalesce(cardinality(images),0)=0 $stub$;
"""
programme = (ROOT / 'supabase/migrations/99991790271091_event_data_quality_programme.sql').read_text()


def function(name):
    match = re.search(r'create or replace function public\.' + name + r'\(.*?\n\$\$;', programme, re.I | re.S)
    if not match:
        raise SystemExit(f'Committed {name} function not found')
    return match[0]


previous = list((ROOT / 'supabase/migrations').glob('*_historical_event_source_copy_outcomes.sql'))
paths = list((ROOT / 'supabase/migrations').glob('*_historical_graph_artwork_source_outcomes.sql'))
if len(paths) != 1 or len(previous) != 1:
    raise SystemExit('Exactly one migration per historical source contract required')
sql = schema + function('decide_event_quality_issue') + function('run_event_quality_scan') + previous[0].read_text() + paths[0].read_text() + next((ROOT / 'supabase/migrations').glob('*_historical_graph_artwork_batch_iteration.sql')).read_text() + next((ROOT / 'supabase/migrations').glob('*_historical_artwork_scan_contention.sql')).read_text() + (HERE / 'historical_graph_artwork.sql').read_text()
with tempfile.TemporaryDirectory(prefix='qg-graph-artwork-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([binary('initdb'), '-D', str(data), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([binary('pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'postgres.log'),
                    '-o', f'-k {tmp} -p 55495 -c listen_addresses=', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        subprocess.run([binary('psql'), '-h', tmp, '-p', '55495', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, check=True)
    finally:
        subprocess.run([binary('pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
