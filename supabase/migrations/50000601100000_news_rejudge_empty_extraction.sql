-- ============================================================================
-- Re-judge the news rows that were rejected on an empty extraction.
-- ----------------------------------------------------------------------------
-- Companion to the pipeline-quality-enhance fixes:
--   * decision.ts      — extractionIsEmpty(): a blank record is not a verdict
--   * image-check.ts   — resolveStagedImageUrl(): stop replacing real artwork
--
-- THE FAULT. parseQualityDecision defaults every absent field, so a model
-- returning a structurally valid but EMPTY JSON object produced
-- {isRelevant:false, relevanceScore:0, confidence:0} — byte-identical to a
-- confident "clearly irrelevant" — and evaluatePublishGate's outright-reject
-- branch fired on it. pipeline-review-gate then read that verdict and stamped
-- disposition='rejected' with review_notes 'auto: LLM relevance/quality
-- rejected'. Absence of evidence became evidence of absence, twice over.
--
-- Measured on prod 2026-09-13: the signature covers 1,129 rows back to
-- 2026-05-24, and it separates cleanly — 443 of 1,031 rejected rows carry it
-- against 0 of 1,212 review rows.
--
-- Every count in this header is a SNAPSHOT and drifts with inflow (group C moved
-- 393 -> 396 within twenty minutes of being measured). The assertions below are
-- deliberately count-free — they check that the cohort is non-empty and that
-- each exclusion still has something to exclude — so a correct run is never
-- turned red by ordinary churn, which is how a guard trains people to ignore it.
--
-- ORDER MATTERS, AND THIS FUNCTION CANNOT ENFORCE IT.
-- news_orphan_reclaim (hourly, :30) posts to pipeline-quality-enhance with
-- batch_size 15 and NO pipeline_run_id, so a reset row is re-offered within the
-- hour. If the code fix is not yet deployed, that hour re-judges with the OLD
-- parser, re-stamps the identical verdict, and burns the LLM calls — leaving the
-- cohort signature unchanged and the work invisible again. SQL cannot see which
-- edge-function build is live, so the precondition is asserted by a human:
-- p_confirm_fixes_deployed must be passed true. That is deliberately a hand
-- assertion and not a guessed proxy.
--
-- DELIBERATELY NOT RUN ONE-SHOT IN THIS MIGRATION, and no cron is registered.
-- The reset itself is a cheap UPDATE (ingestion_staging carries no search
-- trigger), so it needs no batching for write cost — p_limit exists to let the
-- cohort be worked in reviewable waves, not because a full pass is dangerous.
-- The expensive half is downstream and is already rate-limited by the existing
-- cron, so a second cron here would only duplicate a working drain.
--
-- SCOPE — the exclusions are the reviewed part.
--
--   INCLUDED, group A (458 rows): disposition='rejected' AND review_notes like
--     'auto: LLM relevance/quality rejected%'. The note is written only by
--     pipeline-review-gate's quality_status='rejected' branch, so it PROVES the
--     rejection was caused by the artifact verdict. Fully reversed.
--
--   INCLUDED, group C (396 rows): disposition='pending'. Never dispositioned —
--     only the verdict holds them. Nothing to reverse but the verdict itself.
--
--   EXCLUDED, other review-gate notes (36 rows): disposition='rejected' with a
--     review_notes that is NOT the quality marker. review-gate rejected them for
--     a stated reason of its own, so the artifact is not provably the cause.
--
--   EXCLUDED, group B (204 rows): disposition='rejected' with
--     review_status='auto' and NO review_notes. review-gate always writes both
--     columns together, so something ELSE rejected these and we do not yet know
--     what. Reversing a rejection whose cause is unidentified could resurrect
--     rows a different gate correctly discarded. Left for their own change.
--
--   EXCLUDED, published (35 rows): disposition IN ('inserted','updated'). These
--     are live news_articles. Re-judging cannot unpublish and must not try; a
--     stale blank decision on a published row is a provenance wart, not a
--     content defect (commit derives the title and body from normalized_data,
--     never from the decision).
--
--   EXCLUDED, duplicates: the quality-enhance selector skips
--     dedup_status='duplicate', so resetting one spends a write to achieve
--     nothing.
--
-- REVERSIBILITY. The prior verdict is preserved verbatim under
-- enriched_data.quality_retracted before it is cleared — the new run overwrites
-- quality_decision, so without this the old judgement would be destroyed rather
-- than superseded. enriched_data.quality_rejudge stamps the pass, and is also
-- the idempotency key: a row already re-judged is never re-offered, so repeated
-- calls converge instead of looping.
--
-- review_status is moved 'rejected' -> 'auto' ONLY. A row sitting at
-- 'pending_review' (47 of group C) stays there: a human queued it, and yanking
-- it out to re-judge it would discard that decision — the exact failure this
-- repo already documents for ai_validation_status.
--
-- WHAT THIS DOES NOT FIX. Re-judging re-probes the image, so rows in the cohort
-- pick up the artwork fix too. Rows ALREADY PUBLISHED with a Pexels photo are
-- not touched here; re-deriving those is a separate decision.
--
-- THROUGHPUT, stated because it is a product trade-off and not a detail: the
-- drain is oldest-first, and this cohort (from 2026-05-24) sorts ahead of
-- current inflow (2026-09-12). At 15/hour, 851 rows take ~57 hours, during
-- which new articles and podcasts queue behind it. Raise
-- news_orphan_reclaim's batch_size, or work the cohort in waves via p_limit,
-- if that delay is not acceptable.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_news_quality_rejudge(
  p_limit                   integer DEFAULT 500,
  p_dry_run                 boolean DEFAULT true,
  p_confirm_fixes_deployed  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eligible integer := 0;
  v_group_a  integer := 0;
  v_group_c  integer := 0;
  v_reset    integer := 0;
  v_left     integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'p_limit must be >= 1';
  END IF;

  CREATE TEMP TABLE _rejudge_cohort ON COMMIT DROP AS
  SELECT s.id,
         (s.disposition = 'rejected'
          AND s.review_notes LIKE 'auto: LLM relevance/quality rejected%') AS is_group_a
  FROM ingestion_staging s
  WHERE s.target_table = 'news_articles'
    AND s.enriched_data->>'quality_status' = 'rejected'
    AND jsonb_typeof(s.enriched_data->'quality_decision') = 'object'
    AND coalesce(btrim(s.enriched_data->'quality_decision'->>'cleanedBody'), '') = ''
    AND coalesce(btrim(s.enriched_data->'quality_decision'->>'title'), '') = ''
    AND coalesce(btrim(s.enriched_data->'quality_decision'->>'excerpt'), '') = ''
    AND coalesce((s.enriched_data->'quality_decision'->>'confidence')::numeric, 0) = 0
    AND s.disposition NOT IN ('inserted', 'updated')
    AND coalesce(s.dedup_status, 'pending') <> 'duplicate'
    AND NOT (s.enriched_data ? 'quality_rejudge')
    AND (
      (s.disposition = 'rejected'
       AND s.review_notes LIKE 'auto: LLM relevance/quality rejected%')
      OR s.disposition = 'pending'
    );

  SELECT count(*), count(*) FILTER (WHERE is_group_a), count(*) FILTER (WHERE NOT is_group_a)
    INTO v_eligible, v_group_a, v_group_c
  FROM _rejudge_cohort;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'eligible', v_eligible,
      'group_a_rejected_by_review_gate', v_group_a,
      'group_c_pending_only', v_group_c,
      'would_reset', least(v_eligible, p_limit),
      'note', 'pass p_dry_run => false AND p_confirm_fixes_deployed => true to apply'
    );
  END IF;

  IF NOT p_confirm_fixes_deployed THEN
    RAISE EXCEPTION
      'refusing to reset: confirm the pipeline-quality-enhance fixes are DEPLOYED, '
      'then re-call with p_confirm_fixes_deployed => true. Resetting against the '
      'old build re-stamps the identical verdict and burns the LLM calls.';
  END IF;

  WITH picked AS (
    SELECT id FROM _rejudge_cohort ORDER BY id LIMIT p_limit
  )
  UPDATE ingestion_staging s
  SET enriched_data =
        (s.enriched_data - 'quality_status' - 'quality_decision')
        || jsonb_build_object(
             'quality_retracted', jsonb_build_object(
               'status',           s.enriched_data->>'quality_status',
               'decision',         s.enriched_data->'quality_decision',
               'blocked_reasons',  s.enriched_data->'auto_publish_blocked_reasons',
               'pipeline_version', s.enriched_data->>'quality_pipeline_version',
               'run_at',           s.enriched_data->>'quality_run_at'),
             'quality_rejudge', jsonb_build_object(
               'at',     now(),
               'reason', 'empty_extraction_artifact')),
      enrichment_status = 'enriched',
      disposition       = 'pending',
      review_status     = CASE WHEN s.review_status = 'rejected' THEN 'auto'
                               ELSE s.review_status END,
      review_notes      = CASE WHEN s.review_notes LIKE 'auto: LLM relevance/quality rejected%'
                               THEN NULL ELSE s.review_notes END,
      updated_at        = now()
  FROM picked p
  WHERE s.id = p.id;

  GET DIAGNOSTICS v_reset = ROW_COUNT;

  -- Postcondition: every row we touched must now satisfy the quality-enhance
  -- selector, or the reset achieved nothing and must not report success.
  SELECT count(*) INTO v_left
  FROM ingestion_staging s
  JOIN _rejudge_cohort c ON c.id = s.id
  WHERE s.enriched_data ? 'quality_rejudge'
    AND NOT (s.enrichment_status = 'enriched'
             AND s.disposition = 'pending'
             AND s.enriched_data->>'quality_status' IS NULL
             AND coalesce(s.dedup_status, 'pending') <> 'duplicate');

  IF v_left > 0 THEN
    RAISE EXCEPTION
      'postcondition failed: % reset rows are still outside the quality-enhance selector', v_left;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', false,
    'eligible', v_eligible,
    'group_a_rejected_by_review_gate', v_group_a,
    'group_c_pending_only', v_group_c,
    'reset', v_reset,
    'remaining', greatest(v_eligible - v_reset, 0),
    'drain', 'news_orphan_reclaim (hourly :30) re-judges at batch_size 15, oldest-first'
  );
END
$function$;

REVOKE ALL ON FUNCTION public.run_news_quality_rejudge(integer, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_news_quality_rejudge(integer, boolean, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.run_news_quality_rejudge(integer, boolean, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.run_news_quality_rejudge(integer, boolean, boolean) TO service_role;

COMMENT ON FUNCTION public.run_news_quality_rejudge(integer, boolean, boolean) IS
  'Re-offers news staging rows that pipeline-quality-enhance rejected on an empty '
  'LLM extraction (blank title/excerpt/body with confidence 0) back to the quality '
  'stage. Preserves the retracted verdict under enriched_data.quality_retracted and '
  'stamps enriched_data.quality_rejudge as the idempotency key. Excludes published '
  'rows, duplicates, and rejections whose cause is not provably this artifact. '
  'Requires p_confirm_fixes_deployed => true because SQL cannot see which '
  'edge-function build is live. Dry run by default.';

-- ============================================================================
-- Assert the cohort the function will act on is the one that was reviewed, and
-- that the exclusions actually exclude. A predicate that silently matches
-- everything (or nothing) is the failure mode here, so both directions are
-- checked rather than only the happy one.
-- ============================================================================
DO $verify$
DECLARE
  v jsonb;
  v_published integer;
  v_group_b   integer;
BEGIN
  v := public.run_news_quality_rejudge(p_limit => 500, p_dry_run => true);

  IF (v->>'eligible')::int = 0 THEN
    RAISE EXCEPTION 'cohort is empty — the signature no longer matches anything: %', v;
  END IF;

  -- Positive control: published rows carry the signature and must be excluded.
  SELECT count(*) INTO v_published
  FROM ingestion_staging s
  WHERE s.target_table = 'news_articles'
    AND s.enriched_data->>'quality_status' = 'rejected'
    AND coalesce(btrim(s.enriched_data->'quality_decision'->>'cleanedBody'), '') = ''
    AND coalesce(btrim(s.enriched_data->'quality_decision'->>'title'), '') = ''
    AND coalesce((s.enriched_data->'quality_decision'->>'confidence')::numeric, 0) = 0
    AND s.disposition IN ('inserted', 'updated');

  -- Positive control: group B carries the signature and must be excluded.
  SELECT count(*) INTO v_group_b
  FROM ingestion_staging s
  WHERE s.target_table = 'news_articles'
    AND s.enriched_data->>'quality_status' = 'rejected'
    AND coalesce(btrim(s.enriched_data->'quality_decision'->>'cleanedBody'), '') = ''
    AND coalesce(btrim(s.enriched_data->'quality_decision'->>'title'), '') = ''
    AND coalesce((s.enriched_data->'quality_decision'->>'confidence')::numeric, 0) = 0
    AND s.disposition = 'rejected'
    AND s.review_notes IS NULL;

  IF v_published = 0 THEN
    RAISE EXCEPTION 'published positive control is zero — the exclusion cannot be shown to work';
  END IF;
  IF v_group_b = 0 THEN
    RAISE EXCEPTION 'group-B positive control is zero — the exclusion cannot be shown to work';
  END IF;

  RAISE NOTICE 'rejudge cohort: % eligible (A=%, C=%); excluded: % published, % group-B',
    v->>'eligible', v->>'group_a_rejected_by_review_gate', v->>'group_c_pending_only',
    v_published, v_group_b;
END
$verify$;
