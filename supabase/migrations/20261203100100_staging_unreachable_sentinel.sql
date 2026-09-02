-- ============================================================================
-- staging_unreachable_stats(): news staging rows NO live consumer can select.
-- ----------------------------------------------------------------------------
-- `pipeline_hygiene_stats().stale_pending_by_entity` counts rows sitting at
-- disposition='pending' for >48h. It cannot distinguish a slow queue from a
-- dead one, and that is exactly why this class hid: a permanently unreachable
-- row and a merely-backlogged row are the same number to it, so it read as
-- "the drain is behind" for months while the true answer was "these rows can
-- never move again".
--
-- SCOPE IS news_articles ONLY, and that narrowness is the point.
-- ----------------------------------------------------------------------------
-- A first draft of this function keyed on `enrichment_status NOT IN ('pending',
-- 'enriched')` across EVERY entity type, on the theory that a row outside both
-- enrichment selectors is stranded. That is false for four of the five, and
-- measuring it is what settles the question: `enrichment_status` is read by
-- exactly ONE commit RPC, news_commit_staging_batch. commit_venue_/event_/
-- marketplace_/personality_staging_batch never mention the column, so
-- advancing it does not strand those rows and they were pending for unrelated
-- reasons — measured 2026-09-02: 406 venue/marketplace rows at
-- review_status='pending_review' (waiting on a HUMAN, working as designed),
-- 505 marketplace at dedup_status='merge_candidate', 966 personality/event
-- rows still at ai_validation_status='pending' (a run-scoping defect, not this
-- one). Counting those as "unreachable" would have made this sentinel assert
-- that a healthy review queue was a dead pipeline.
--
-- For news the mechanism IS real and end-to-end verifiable:
--   enrichment-driver (pipeline-enrich-news) selects enrichment_status='pending'
--   pipeline-quality-enhance          selects enrichment_status='enriched'
--                                     AND enriched_data->>quality_status IS NULL
-- and pipeline-quality-enhance is the ONLY live caller of
-- news_commit_staging_batch for a row with no pipeline_run_id. So a news row
-- stamped 'completed' before it was enriched is invisible to both and can never
-- reach commit. Note the commit RPC itself would ACCEPT such a row — the block
-- is the caller's selector, not the commit gate.
--
-- Two by-design holds are deliberately NOT counted, or this function would
-- report the news quality queue as breakage:
--   quality_status='review'   -> held for the human queue by news_commit_staging_batch
--   quality_status='rejected' -> off-topic/low quality, deliberately never committed
-- Measured 2026-09-02: 858 rows across those two.
--
-- Also NOT counted, because they are a different defect with a different fix
-- (named here so they are not silently rolled into this number):
--   enrichment_status='failed' (715 news rows, oldest 2026-05-12) — enrichment
--     genuinely failed; resetting them re-runs a failing call.
--   quality_status='passed' but still disposition='pending' (826 rows) —
--     enhanced and passed, never committed. quality-enhance filters
--     `quality_status IS NULL`, so an already-enhanced row can never be
--     re-offered to commit. That is a one-shot-selector bug, not this one.
--
-- What this counts: 2,786 rows on 2026-09-02, oldest 2026-07-14.
--
-- `recent_24h` is the load-bearing key and the reason this is a function rather
-- than a dashboard query. A stranded row is by definition never written again,
-- so its `updated_at` is when it became unreachable — which makes `recent_24h`
-- a clean zero-invariant: it counts only NEW stranding. It must be 0 once
-- pipeline-quality-score stops advancing enrichment_status on rows it picked up
-- on the 'pending' arm. A non-zero value means a writer is stranding rows
-- again; it does NOT decay as the backlog ages, so it cannot be satisfied by
-- waiting for the queue to drain.
--
-- Deliberately a SEPARATE function rather than another key inside
-- pipeline_hygiene_stats(): that function is ~5.7 KB and adding a key means
-- restating the whole body, which is a merge-collision surface every concurrent
-- session competes for.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.staging_unreachable_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH unreachable AS (
    SELECT s.updated_at, s.created_at
    FROM public.ingestion_staging s
    WHERE s.target_table = 'news_articles'
      AND s.disposition = 'pending'
      -- Outside both enrichment selectors: enrich takes 'pending',
      -- quality-enhance takes 'enriched'.
      AND s.enrichment_status = 'completed'
      -- Scored by pipeline-quality-score (the only writer of quality_score)...
      AND s.enriched_data ? 'quality_score'
      -- ...but never seen by quality-enhance (the only writer of quality_status).
      -- This pair IS the signature: scored, never enriched. It also excludes the
      -- 'review'/'rejected' by-design holds, which carry a quality_status.
      AND NOT (s.enriched_data ? 'quality_status')
  )
  SELECT jsonb_build_object(
    'total',      (SELECT count(*) FROM unreachable),
    -- Zero-invariant. Non-zero => something is stranding rows RIGHT NOW.
    'recent_24h', (SELECT count(*) FROM unreachable WHERE updated_at > now() - interval '24 hours'),
    'oldest_created_at', (SELECT min(created_at) FROM unreachable)
  );
$function$;

COMMENT ON FUNCTION public.staging_unreachable_stats() IS
  'news_articles staging rows no live consumer can select: disposition=pending, enrichment_status=completed, scored by quality-score but never seen by quality-enhance. Deliberately news-only — enrichment_status gates commit for news alone. recent_24h is a zero-invariant for NEW stranding — read by scripts/check-pipeline-health.mjs. See 20261203100100.';

REVOKE ALL ON FUNCTION public.staging_unreachable_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staging_unreachable_stats() TO service_role;
