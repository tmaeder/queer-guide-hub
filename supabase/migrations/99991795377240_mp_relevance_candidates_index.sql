-- Partial index for marketplace_relevance_candidates().
--
-- Measured 2026-11-22: mp_drain_relevance_backlog got HTTP 500 at 19:15 because the
-- candidate query hit the 8s PostgREST statement timeout ("canceling statement due to
-- statement timeout", 19:15:08). The only usable index was idx_ingestion_staging_disposition,
-- so the query read all 29,203 pending staging rows (18,482 heap blocks, ~145 MB, mostly from
-- disk) to return 5. EXPLAIN ANALYZE: 1.9s; pg_stat_statements: mean 2.4s, max 7.2s over 23
-- successful calls. At :15 other crons start and it crosses 8s. Three such failures in a row
-- auto-paused the job on 2026-11-03.
--
-- The predicate below is the function's fixed predicate, so the planner can use the index for
-- every call (the optional run/source filters only narrow it further). It holds ~5 rows.
-- Plain CREATE INDEX (migrations run in a transaction): takes a SHARE lock on
-- ingestion_staging for the build; only cron writers are blocked, for seconds.

create index if not exists ingestion_staging_mp_relevance_candidates_idx
  on public.ingestion_staging (created_at, id)
  where target_table = 'marketplace_listings'
    and disposition = 'pending'
    and ai_validation_status = 'approved'
    and classification_result is null
    and dedup_status in ('pending', 'unique', 'merge_candidate');

do $verify$
begin
  if not exists (
    select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
    where c.relname = 'ingestion_staging_mp_relevance_candidates_idx' and i.indisvalid
  ) then
    raise exception 'P1 failed: ingestion_staging_mp_relevance_candidates_idx missing or invalid';
  end if;
end
$verify$;
