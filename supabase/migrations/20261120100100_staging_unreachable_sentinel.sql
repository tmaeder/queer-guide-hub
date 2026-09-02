-- ============================================================================
-- staging_unreachable_stats(): rows NO live consumer can select.
-- ----------------------------------------------------------------------------
-- `pipeline_hygiene_stats().stale_pending_by_entity` counts rows sitting at
-- disposition='pending' for >48h. It cannot distinguish a slow queue from a
-- dead one, and that is exactly why this class hid: a permanently unreachable
-- row and a merely-backlogged row are the same number to it, so it read as
-- "the drain is behind" for months while the true answer was "these rows can
-- never move again". The oldest measured was 2026-05-12.
--
-- A staging row is UNREACHABLE when its disposition is still 'pending' and:
--   (a) enrichment_status is neither 'pending' nor 'enriched' — the two values
--       the stage functions select on. pipeline-enrich-* takes 'pending';
--       pipeline-quality-enhance takes 'enriched'. Anything else ('completed',
--       'failed') is invisible to both, and for a row with no pipeline_run_id
--       quality-enhance is the only path to news_commit_staging_batch; AND
--   (b) the run-scoped stages cannot reach it either — pipeline-validate and
--       pipeline-deduplicate filter .eq('pipeline_run_id', <current run>), so a
--       row with a NULL run id, or one whose run already reached a terminal
--       status, is out of their reach permanently. A later run never revisits
--       an earlier run's rows.
--
-- Measured on prod 2026-09-02, before the pipeline-quality-score fix that ships
-- alongside this migration: 6,929 rows over FIVE entity types —
-- news_articles 5,192 / personalities 929 / marketplace_listings 527 /
-- venues 243 / events 38. Only news was above its stale threshold, so the other
-- 1,737 rows were invisible to every existing check.
--
-- `recent_24h` is the load-bearing key and the reason this is a function rather
-- than a dashboard query. The historical cohort has an old `updated_at` (a
-- stranded row is by definition never written again, so `updated_at` is when it
-- became unreachable), which makes `recent_24h` a clean zero-invariant: it
-- counts only NEW stranding. It was 53 at the time of writing and must be 0
-- once pipeline-quality-score stops advancing enrichment_status on rows it
-- picked up on the 'pending' arm. A non-zero value means a writer is stranding
-- rows again — it does NOT decay as the backlog ages, so it cannot be satisfied
-- by waiting.
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
    SELECT s.target_table, s.updated_at, s.created_at
    FROM public.ingestion_staging s
    WHERE s.disposition = 'pending'
      -- (a) outside both enrichment selectors
      AND s.enrichment_status NOT IN ('pending', 'enriched')
      -- (b) outside the run-scoped selectors too
      AND (
        s.pipeline_run_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.pipeline_runs r
          WHERE r.id = s.pipeline_run_id
            AND r.status IN ('completed', 'failed')
        )
      )
  )
  SELECT jsonb_build_object(
    'total',      (SELECT count(*) FROM unreachable),
    -- Zero-invariant. Non-zero => something is stranding rows RIGHT NOW.
    'recent_24h', (SELECT count(*) FROM unreachable WHERE updated_at > now() - interval '24 hours'),
    'by_entity',  COALESCE((
      SELECT jsonb_object_agg(target_table, n)
      FROM (SELECT target_table, count(*) AS n FROM unreachable GROUP BY target_table) t
    ), '{}'::jsonb),
    'recent_by_entity', COALESCE((
      SELECT jsonb_object_agg(target_table, n)
      FROM (
        SELECT target_table, count(*) AS n
        FROM unreachable WHERE updated_at > now() - interval '24 hours'
        GROUP BY target_table
      ) t
    ), '{}'::jsonb),
    'oldest_created_at', (SELECT min(created_at) FROM unreachable)
  );
$function$;

COMMENT ON FUNCTION public.staging_unreachable_stats() IS
  'ingestion_staging rows no live consumer can select: disposition=pending, enrichment_status outside (pending, enriched), and unreachable by the run-scoped stages. recent_24h is a zero-invariant for NEW stranding — read by scripts/check-pipeline-health.mjs. See 20261120100100.';

REVOKE ALL ON FUNCTION public.staging_unreachable_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staging_unreachable_stats() TO service_role;
