-- Per-table autovacuum tuning for the churn-heavy tables. NO table is rewritten and no row is
-- touched: `ALTER TABLE ... SET (autovacuum_*)` takes only SHARE UPDATE EXCLUSIVE, which does not
-- block SELECT/INSERT/UPDATE/DELETE. Fully reversible with RESET.
--
-- WHY, measured on prod 2026-09-10. `autovacuum_vacuum_scale_factor` is the stock 0.2 and NOT ONE
-- of the 495 tables carries a per-table override (pg_class.reloptions is null on all of them). 0.2
-- means a table must accumulate dead tuples equal to 20% of its live rows before autovacuum looks
-- at it -- on `events` that is ~9,800 dead rows, on `search_visibility_scores` ~44,000. Free space
-- measured with pgstattuple_approx tracks that ceiling almost exactly: marketplace_listings 50.7%,
-- events 45.0%, ingestion_staging 37.9%.
--
-- WHAT THIS DOES NOT FIX, stated so nobody expects it to. Two separate things were conflated in
-- the first draft of this work, and only measuring churn separated them:
--
--   1. `tag_change_log` is DELIBERATELY EXCLUDED. 647 MB, and over the 5-day stats window it
--      recorded 3,683 inserts, 0 updates and 0 deletes -- 0.0% churn. An append-only table
--      generates no dead tuples, so autovacuum settings cannot reclaim anything there. Its size is
--      DATA, not bloat, and the lever for it is retention.
--
--   2. The heap free space that already exists is not returned by this change. Autovacuum makes
--      space REUSABLE, not free-to-OS. This stops the bloat growing; shrinking the files needs
--      pg_repack (available in this project, not installed) after a retention pass.
--
-- THE REAL BLOAT ENGINE IS THE HOT-UPDATE RATIO, which is worth recording because it is the next
-- lever and it is not this one. Measured over the same window:
--
--   search_visibility_scores   24,599 updates,     35 HOT  (0.1%)
--   ai_suggestions             14,482 updates,      0 HOT  (0%)
--   events                    303,519 updates, 25,309 HOT  (8.3%)
--   marketplace_listings       98,994 updates, 33,129 HOT  (33%)
--
-- A non-HOT update writes a new tuple AND a new entry in every index on the table. At 0.1% HOT,
-- `search_visibility_scores` is effectively re-indexing itself on every pass. The fix for that is
-- `fillfactor` (leaving free space on each page so an update can stay on-page) plus not indexing
-- the columns being updated -- but fillfactor only affects pages written AFTER it is set, so it
-- belongs with the repack, not here. Deliberately left out of this migration rather than bundled.
--
-- Values: 0.02 for the two worst offenders by free space, 0.05 elsewhere -- 10x and 4x more
-- frequent than the 0.2 default. Not lower: autovacuum costs I/O on a disk-constrained instance,
-- and the goal is to stop 40-50% free space accumulating, not to chase 0%. The explicit
-- `autovacuum_vacuum_threshold` floor keeps a small table from vacuuming continuously.

-- Update-churn driven, worst free-space ratios.
alter table public.events                    set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 1000);
alter table public.marketplace_listings      set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 1000);

-- Update-churn driven, moderate.
alter table public.news_articles             set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 1000);
alter table public.venues                    set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 1000);
alter table public.search_visibility_scores  set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 1000);
alter table public.ai_suggestions            set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 1000);

-- Delete driven (cascades and drains). These three recorded ZERO autovacuum runs in the window
-- while carrying the highest free-space ratios measured: enrichment_log 72.7%,
-- scraper_dedupe_decisions 61.4%, ingestion_events 56.9%.
alter table public.ingestion_events          set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 1000);
alter table public.enrichment_log            set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 1000);
alter table public.scraper_dedupe_decisions  set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 1000);

-- Mixed insert/update/delete, and the single largest table at 1,840 MB.
alter table public.ingestion_staging         set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 1000);

-- 249,021 inserts and 248,592 deletes in five days -- the reindex drain's churn.
alter table public.search_documents          set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 1000);

do $$
declare
  v_tuned integer;
begin
  select count(*) into v_tuned
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.reloptions::text like '%autovacuum_vacuum_scale_factor%';

  if v_tuned <> 11 then
    raise exception 'expected 11 tuned tables, found %', v_tuned;
  end if;

  -- The exclusion is an assertion, not a comment: if tag_change_log ever starts churning this
  -- should be revisited deliberately rather than by someone noticing it is missing from the list.
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'tag_change_log'
      and c.reloptions::text like '%autovacuum%'
  ) then
    raise exception 'tag_change_log was tuned -- it is append-only (0%% churn) and tuning cannot help it';
  end if;
end $$;
