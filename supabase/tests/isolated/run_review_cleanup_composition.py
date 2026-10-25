#!/usr/bin/env python3
"""Run all four real cleanup migrations together against populated fixtures."""
import ast
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
PG = Path(os.environ.get('PG_BINDIR', '/opt/homebrew/opt/postgresql@17/bin'))


def fixture_schema(name):
    tree = ast.parse((Path(__file__).parent / name).read_text())
    return next(ast.literal_eval(node.value) for node in tree.body
                if isinstance(node, ast.Assign) and any(
                    isinstance(target, ast.Name) and target.id == 'schema' for target in node.targets))


# Reuse source-rich positive and refusal fixtures without executing their runners.
schema = fixture_schema('run_publisher_occurrence_copy.py')
schema = schema.replace('is_recurring boolean default false,series_key text);', "is_recurring boolean default false,series_key text,event_type text default 'other',field_provenance jsonb default '{}',updated_at timestamptz default now());")
schema += """
drop trigger no_event_write on events;
create table content_revisions(source_table text,source_id uuid,actor_kind text,changed_fields text[]);
create schema extensions;create extension pgcrypto with schema extensions;
"""
news = fixture_schema('run_exact_news_source_duplicates.py')
schema += news[news.index('create table news_articles'):news.index('create function api_private.run_review_automatic_resolution')]
schema += "alter table ingestion_staging add enrichment_status text default 'enriched';\n"
schema += news[news.index('insert into news_articles'):]
recovery = fixture_schema('run_news_source_recovery.py')
schema += recovery[recovery.index('create table news_quality_settings'):recovery.index('create function api_private.reconcile_publisher_event_copy')]
schema = schema.replace('create table vault.decrypted_secrets', 'create schema vault;create table vault.decrypted_secrets')
schema += recovery[recovery.index('insert into ingestion_staging'):recovery.index('update ingestion_staging')].replace('generate_series(1,24)', 'generate_series(100,100)')
schema += """
insert into events(id,title,start_date,external_id,data_source) values(md5('format')::uuid,'Board Game Night','2026-10-25T12:00:00Z','format','qcal');
insert into event_sources select id,id,'qcal',external_id,'https://qcal.app/event/format',repeat('a',64),
 jsonb_build_object('normalized',jsonb_build_object('sourceId',external_id,'title',title,'start_date',start_date,
 'metadata',jsonb_build_object('source','qcal')),'raw',jsonb_build_object('title',title,'slug',external_id,'url','https://qcal.app/event/format')) from events where id=md5('format')::uuid;
insert into event_quality_issues(id,event_id,issue_code)values(md5('format')::uuid,md5('format')::uuid,'CATEGORY_UNRESOLVED');
insert into event_quality_current values(md5('format')::uuid,array['CATEGORY_UNRESOLVED','KEEP_OTHER'],array['CATEGORY_UNRESOLVED','KEEP_OTHER']);
create table combined_before_events as select id,to_jsonb(e)value from events e;
create table combined_before_sources as select id,to_jsonb(s)value from event_sources s;
"""
# Preserve the real publisher detector patch anchor and provide the independent
# native category finding that the format resolver must clear by fixing data.
schema = schema.replace("and series_key is null\n$body$;", "and series_key is null\n union all select 'CATEGORY_UNRESOLVED' from events where id=p_event_id and event_type='other'\n$body$;")
policy = (ROOT / 'supabase/migrations/20261022180826_review_automatic_resolution.sql').read_text()
policy = re.search(r'create function api_private.review_news_machine_outcome[\s\S]*?end \$\$;', policy).group(0)
migrations = [
    '99991792970613_event_quality_publisher_occurrence_copy.sql',
    '99991792970626_review_news_source_text_recovery.sql',
    '99991792970705_source_explicit_event_formats.sql',
    '99991792970769_review_exact_news_source_duplicates.sql',
]
checks = """
do $check$declare r jsonb;begin
 r:=api_private.run_review_automatic_resolution(100,true);
 if r->>'publisher_description_findings'<>'4' or r#>>'{source_event_formats,corrected_events}'<>'1'
 or r#>>'{exact_news_source_duplicates,duplicate_sources}'<>'1' or r->>'source_recovery_needed'<>'true'
 or r->>'existing_result'<>'true' then raise exception 'Lost positive cohort/legacy result: %',r;end if;
 if exists(select 1 from admin_review_repairs)or exists(select 1 from http_requests)
 or exists(select 1 from combined_before_events b join events e using(id)where b.value<>to_jsonb(e))
 or exists(select 1 from before_stages b join ingestion_staging s using(id)where b.value<>to_jsonb(s))then raise exception 'Combined dry wrote';end if;
 update admin_automations set enabled=false;
 r:=api_private.run_review_automatic_resolution(100,false);
 if r->>'publisher_copy_skipped'<>'paused' or r#>>'{source_event_formats,skipped}'<>'paused'
 or r#>>'{exact_news_source_duplicates,skipped}'<>'paused' or r->>'source_recovery_enqueue_skipped'<>'paused'
 or exists(select 1 from admin_review_repairs)or exists(select 1 from http_requests)then raise exception 'Combined pause failed: %',r;end if;
 update admin_automations set enabled=true;
 r:=api_private.run_review_automatic_resolution(0,false);
 if exists(select 1 from admin_review_repairs)or exists(select 1 from http_requests)then raise exception 'Zero batch wrote: %',r;end if;
 r:=api_private.run_review_automatic_resolution(100,false);
 if r->>'publisher_description_findings'<>'4' or r#>>'{source_event_formats,corrected_events}'<>'1'
 or r#>>'{exact_news_source_duplicates,duplicate_sources}'<>'1' or r->>'source_recovery_requests_queued'<>'1'
 or r->>'existing_result'<>'true' then raise exception 'Combined apply lost cohort: %',r;end if;
 if (select count(*)from http_requests)<>1 or not exists(select 1 from http_requests where body='{"repair_truncated":true,"batch_size":4}'::jsonb)then raise exception 'Unbounded source dispatch';end if;
 if exists(select 1 from before_articles b join news_articles n using(id)where b.value<>to_jsonb(n))
 or exists(select 1 from before_stages b join ingestion_staging s using(id)where s.id<>md5('1')::uuid and b.value<>to_jsonb(s))
 or exists(select 1 from combined_before_sources b join event_sources s using(id)where b.value<>to_jsonb(s))
 or exists(select 1 from combined_before_events b join events e using(id)where e.id<>md5('format')::uuid and b.value<>to_jsonb(e))then raise exception 'Protected content/source changed';end if;
 if (select count(*)from admin_review_repairs)<>7 then raise exception 'Incomplete combined audit';end if;
 if not exists(select 1 from events where id=md5('format')::uuid and event_type='social')or not exists(select 1 from ingestion_staging where id=md5('1')::uuid and disposition='skipped'and review_status='pending_review')then raise exception 'Wrong repaired state';end if;
 r:=api_private.run_review_automatic_resolution(100,true);
 if r->>'publisher_description_findings'<>'0' or r#>>'{source_event_formats,corrected_events}'<>'0'
 or r#>>'{exact_news_source_duplicates,duplicate_sources}'<>'0' then raise exception 'Repeated fixes: %',r;end if;
 if has_function_privilege('authenticated','api_private.reconcile_exact_news_source_duplicates(integer,boolean)','execute')
 or has_function_privilege('anon','api_private.reconcile_source_event_formats(integer,boolean)','execute')then raise exception 'Browser access';end if;
end $check$;
"""
sql = schema + policy + ''.join((ROOT / 'supabase/migrations' / name).read_text() for name in migrations) + checks
with tempfile.TemporaryDirectory(prefix='qg-review-composition-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([str(PG / 'initdb'), '-D', str(data), '-A', 'trust', '--no-locale'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-l', str(Path(tmp) / 'postgres.log'), '-o', f'-k {tmp} -p 55499 -c listen_addresses=', '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
    try:
        result = subprocess.run([str(PG / 'psql'), '-h', tmp, '-p', '55499', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr)
    finally:
        subprocess.run([str(PG / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)
print('PASS: four real cleanup migrations; simultaneous positive cohorts, dry/pause/zero bounds, unchanged source/catalogue/human refusals, complete audit and repeat-run exhaustion')
