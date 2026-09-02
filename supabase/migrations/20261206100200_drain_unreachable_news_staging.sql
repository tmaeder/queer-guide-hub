-- ============================================================================
-- Drain the news staging rows pipeline-quality-score stranded.
-- ----------------------------------------------------------------------------
-- Companion to 20261206100100 (the sentinel) and to the pipeline-quality-score
-- fix in _shared/quality-score-gating.ts. That node stamped
-- enrichment_status='completed' on rows it picked up on the 'pending' arm —
-- rows it had scored but NOT enriched. For news that is a one-way door:
--
--   enrichment-driver (pipeline-enrich-news) selects enrichment_status='pending'
--   pipeline-quality-enhance                 selects enrichment_status='enriched'
--
-- and pipeline-quality-enhance is the ONLY live caller of
-- news_commit_staging_batch for a row with no pipeline_run_id. A row at
-- 'completed' is outside both selectors and can never reach commit.
--
-- The repair is to put enrichment_status back to 'pending', which is exactly
-- the value the row would have carried had quality-score not advanced it. The
-- row then re-enters the normal chain: pipeline-enrich-news -> 'enriched' ->
-- pipeline-quality-enhance -> news_commit_staging_batch. All 2,786 rows retain
-- normalized_data (verified), so re-enrichment has its input. The cron posts no
-- `require_gates`, and the driver defaults it false, so rows that never cleared
-- validate are eligible too.
--
-- ORDER MATTERS. This must apply AFTER the quality-score fix is deployed, or
-- the old code re-strands the same rows on its next sweep. Two things make that
-- safe rather than merely hoped-for: the migration sorts above the fix's own
-- (20261206100000/100100), and the operation is IDEMPOTENT and re-runnable — if
-- rows are re-stranded, `SELECT public.drain_unreachable_news_staging();` picks
-- them up again. A re-stranding is also loud rather than silent: the drain
-- bumps updated_at, so any row that comes back lands in the sentinel's
-- recent_24h zero-invariant instead of hiding in the historical total.
--
-- SCOPE — deliberately narrow, and the narrowness is the reviewed part.
-- The signature is `enriched_data ? 'quality_score'` (written only by
-- pipeline-quality-score) AND NOT `enriched_data ? 'quality_status'` (written
-- only by pipeline-quality-enhance): scored, never enriched. Everything else
-- that is also sitting at disposition='pending' is left alone because it is
-- stranded for a DIFFERENT reason and resetting it would be wrong or wasteful:
--
--   858 news rows with quality_status IN ('review','rejected')
--       — by-design holds. news_commit_staging_batch excludes them: 'review'
--         waits for the human queue, 'rejected' is off-topic/low quality.
--         Resetting them would re-run a paid LLM call to reach the same verdict.
--   826 news rows with quality_status='passed', still disposition='pending'
--       — a DIFFERENT bug: quality-enhance filters `quality_status IS NULL`, so
--         an already-enhanced row can never be re-offered to commit. These need
--         to be handed to news_commit_staging_batch directly, not re-enriched.
--   715 news rows at enrichment_status='failed' (oldest 2026-05-12)
--       — enrichment genuinely failed. Resetting re-runs a failing call.
--   1,804 non-news rows
--       — enrichment_status is read by exactly ONE commit RPC,
--         news_commit_staging_batch. The venue/event/marketplace/personality
--         commit RPCs never mention the column, so 'completed' does not strand
--         them; they are pending for unrelated reasons (406 awaiting HUMAN
--         review, 505 at dedup merge_candidate, 966 stuck at validate).
--
-- THROUGHPUT: this does not drain instantly and cannot be made to. Re-enrichment
-- is capped by llm_budget for caller 'pipeline-enrich-news' (seeded 600/day), so
-- 2,786 rows take roughly five days to work through. Raising the cron batch size
-- does not help — the budget, not the batch, is the limiter. The sentinel's
-- historical `total` therefore falls gradually; only `recent_24h` is the
-- zero-invariant.
--
-- REVERSIBILITY: every touched row is recorded in news_staging_drain_audit with
-- its previous enrichment_status, so the flip can be undone row-for-row.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.news_staging_drain_audit (
  staging_id      uuid PRIMARY KEY REFERENCES public.ingestion_staging(id) ON DELETE CASCADE,
  prev_enrichment_status text NOT NULL,
  drained_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.news_staging_drain_audit IS
  'One row per news staging row whose enrichment_status was reset completed->pending by drain_unreachable_news_staging (20261206100200). PRIMARY KEY on staging_id makes the drain idempotent per row and is the only record of the previous value.';

ALTER TABLE public.news_staging_drain_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.news_staging_drain_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.news_staging_drain_audit TO service_role;

-- ----------------------------------------------------------------------------
-- Batched so a single statement never holds a long write lock on
-- ingestion_staging. Batching is for lock hygiene only, NOT trigger storms:
-- ingestion_staging carries four triggers and this UPDATE touches
-- enrichment_status alone, so only update_ingestion_staging_updated_at fires
-- (the other three are scoped to source_name/payload_hash and review_status).
-- There is no search_documents trigger on this table.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.drain_unreachable_news_staging(p_batch integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids     uuid[];
  v_n       integer;
  v_total   integer := 0;
  v_batches integer := 0;
BEGIN
  IF p_batch IS NULL OR p_batch < 1 OR p_batch > 2000 THEN
    RAISE EXCEPTION 'p_batch must be between 1 and 2000, got %', p_batch;
  END IF;

  LOOP
    SELECT array_agg(id) INTO v_ids
    FROM (
      SELECT s.id
      FROM public.ingestion_staging s
      WHERE s.target_table = 'news_articles'
        AND s.disposition = 'pending'
        AND s.enrichment_status = 'completed'
        AND s.enriched_data ? 'quality_score'
        AND NOT (s.enriched_data ? 'quality_status')
      ORDER BY s.created_at
      LIMIT p_batch
    ) q;

    v_n := coalesce(cardinality(v_ids), 0);
    EXIT WHEN v_n = 0;

    -- Audit BEFORE the flip, so the previous value is captured even if a later
    -- statement in this batch fails. ON CONFLICT keeps the FIRST observation:
    -- on a re-run after a re-stranding, the original pre-drain value is the one
    -- worth keeping.
    INSERT INTO public.news_staging_drain_audit (staging_id, prev_enrichment_status)
    SELECT s.id, s.enrichment_status
    FROM public.ingestion_staging s
    WHERE s.id = ANY(v_ids)
    ON CONFLICT (staging_id) DO NOTHING;

    UPDATE public.ingestion_staging
      SET enrichment_status = 'pending'
    WHERE id = ANY(v_ids);

    v_total   := v_total + v_n;
    v_batches := v_batches + 1;

    EXIT WHEN v_n < p_batch;
  END LOOP;

  RETURN jsonb_build_object('drained', v_total, 'batches', v_batches);
END;
$function$;

COMMENT ON FUNCTION public.drain_unreachable_news_staging(integer) IS
  'Resets enrichment_status completed->pending on news staging rows scored by pipeline-quality-score but never enriched, returning them to the enrich -> quality-enhance -> commit chain. Idempotent and re-runnable. Previous values in news_staging_drain_audit. See 20261206100200.';

REVOKE ALL ON FUNCTION public.drain_unreachable_news_staging(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.drain_unreachable_news_staging(integer) TO service_role;

-- ----------------------------------------------------------------------------
-- One-shot run. Reports the count so the migration log carries the measurement
-- rather than requiring a follow-up query to know what happened.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.drain_unreachable_news_staging(500);
  RAISE NOTICE 'drain_unreachable_news_staging: %', v_result;
END;
$$;
