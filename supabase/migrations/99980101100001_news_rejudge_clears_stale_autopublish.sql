-- ============================================================================
-- run_news_quality_rejudge left auto_publish / auto_publish_blocked_reasons
-- behind, and the next verdict could not always overwrite them.
-- ----------------------------------------------------------------------------
-- The reset strips 'quality_status' and 'quality_decision' and stashes the old
-- values under 'quality_retracted'. It did NOT strip 'auto_publish' or
-- 'auto_publish_blocked_reasons'.
--
-- On the LLM path that is harmless: evaluatePublishGate writes both keys on
-- every run, so a re-judged row gets fresh, consistent values.
--
-- On the podcast-deterministic path (50000301100000) it is not. That path
-- deliberately writes `quality_status`, `relevance_score` and
-- `quality_decision` and NOTHING ELSE -- it never writes auto_publish or
-- auto_publish_blocked_reasons, because it is not a gate and has no reasons to
-- report. So a row I reset kept the PREVIOUS LLM refusal, and the podcast path
-- then stamped a fresh `passed` beside it. The result reads:
--
--   quality_status              = 'passed'
--   auto_publish                = false
--   auto_publish_blocked_reasons= ["low_relevance","low_quality",...]
--
-- which is exactly the self-contradictory shape that an existing open
-- investigation is chasing on 24 unrelated rows, and exactly what made this
-- one look like the other session's defect when it is mine.
--
-- MEASURED ON PROD, and the split is what proves ownership:
--
--   podcast-deterministic rows NOT reset by me : 2,175 -- 0 stale, 0 auto_publish=false
--   podcast-deterministic rows reset by me     :   154 -- 154 stale, 154 auto_publish=false
--
-- Their pipeline is clean. The stale keys are carried in by the reset.
--
-- HARM. `quality_status` is what news_commit_staging_batch reads, so these rows
-- published correctly (113 of the 420 re-judged rows are live). The damage is
-- to READERS OF THE SIGNALS, not to the content: 8 of the 154 carry a stale
-- 'image_unusable' that feeds news_quality_signals().stale_image_block, and any
-- sentinel keyed on "passed with a non-empty blocked_reasons" -- the natural
-- shape to write for the 24-row investigation -- would fire on these 154 and
-- point at the wrong pipeline.
--
-- SCOPE OF THE REPAIR. Only rows where the CURRENT verdict did not write the
-- keys, i.e. podcast-deterministic. LLM-path rows are deliberately untouched:
-- their reasons were written by the gate on the re-judge run and are current
-- and correct. Clearing those would destroy a live verdict's own output.
-- Nothing is lost either way -- quality_retracted.blocked_reasons already holds
-- the pre-reset values, which is what makes this a cleanup rather than a
-- deletion.
--
-- Soft on preconditions, hard on postconditions: CREATE OR REPLACE over
-- whatever is live, asserts nothing about the prior body, re-runnable.
-- ============================================================================

-- Part 1 -- the producer. Strip both keys on reset; stash auto_publish beside
-- the reasons already being stashed, so the retraction record stays complete.
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
  v_eligible   integer := 0;
  v_group_a    integer := 0;
  v_group_c    integer := 0;
  v_superseded integer := 0;
  v_dupes      integer := 0;
  v_reset      integer := 0;
  v_left       integer := 0;
  v_clash      integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'p_limit must be >= 1';
  END IF;

  CREATE TEMP TABLE _rejudge_raw ON COMMIT DROP AS
  SELECT s.id,
         s.idempotency_key,
         coalesce(s.source_name, s.source_type) AS src,
         s.created_at,
         (s.disposition = 'rejected'
          AND s.review_notes LIKE 'auto: LLM relevance/quality rejected%') AS is_group_a,
         EXISTS (
           SELECT 1
           FROM ingestion_staging o
           WHERE o.id <> s.id
             AND o.idempotency_key IS NOT NULL
             AND o.idempotency_key = s.idempotency_key
             AND coalesce(o.source_name, o.source_type)
                 = coalesce(s.source_name, s.source_type)
             AND o.disposition <> 'rejected'
         ) AS superseded
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

  CREATE TEMP TABLE _rejudge_cohort ON COMMIT DROP AS
  WITH ranked AS (
    SELECT r.*,
           row_number() OVER (PARTITION BY r.src, r.idempotency_key
                              ORDER BY r.created_at DESC, r.id DESC) AS rn
    FROM _rejudge_raw r
    WHERE NOT r.superseded
  )
  SELECT id, is_group_a
  FROM ranked
  WHERE idempotency_key IS NULL OR rn = 1;

  SELECT count(*) FILTER (WHERE superseded) INTO v_superseded FROM _rejudge_raw;
  SELECT count(*) FILTER (WHERE NOT superseded) - (SELECT count(*) FROM _rejudge_cohort)
    INTO v_dupes FROM _rejudge_raw;

  SELECT count(*), count(*) FILTER (WHERE is_group_a), count(*) FILTER (WHERE NOT is_group_a)
    INTO v_eligible, v_group_a, v_group_c
  FROM _rejudge_cohort;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'eligible', v_eligible,
      'group_a_rejected_by_review_gate', v_group_a,
      'group_c_pending_only', v_group_c,
      'superseded_skipped', v_superseded,
      'intra_cohort_dupes_skipped', v_dupes,
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

  SELECT count(*) INTO v_clash
  FROM (
    SELECT 1
    FROM _rejudge_cohort c
    JOIN ingestion_staging s ON s.id = c.id
    WHERE s.idempotency_key IS NOT NULL
    GROUP BY coalesce(s.source_name, s.source_type), s.idempotency_key
    HAVING count(*) > 1
  ) x;

  IF v_clash > 0 THEN
    RAISE EXCEPTION
      'cohort is not unique on (source, idempotency_key): % colliding group(s). '
      'Resetting would violate ux_ingestion_staging_source_idem.', v_clash;
  END IF;

  WITH picked AS (
    SELECT id FROM _rejudge_cohort ORDER BY id LIMIT p_limit
  )
  UPDATE ingestion_staging s
  SET enriched_data =
        -- auto_publish / auto_publish_blocked_reasons are stripped with the
        -- verdict they belong to. The podcast-deterministic path writes neither,
        -- so leaving them behind lets a stale refusal outlive the verdict that
        -- produced it and contradict the next one.
        (s.enriched_data
           - 'quality_status'
           - 'quality_decision'
           - 'auto_publish'
           - 'auto_publish_blocked_reasons')
        || jsonb_build_object(
             'quality_retracted', jsonb_build_object(
               'status',           s.enriched_data->>'quality_status',
               'decision',         s.enriched_data->'quality_decision',
               'auto_publish',     s.enriched_data->'auto_publish',
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
    'superseded_skipped', v_superseded,
    'intra_cohort_dupes_skipped', v_dupes,
    'reset', v_reset,
    'remaining', greatest(v_eligible - v_reset, 0),
    'drain', 'news_orphan_reclaim (hourly :30) re-judges oldest-first'
  );
END;
$function$;

-- Part 2 -- repair the rows already carrying the contradiction.
-- Scoped to podcast-deterministic ONLY: on the LLM path the keys were written
-- by the gate on the re-judge run and are the current verdict's own output.
DO $repair$
DECLARE
  v_before integer;
  v_fixed  integer;
  v_after  integer;
BEGIN
  SELECT count(*) INTO v_before
  FROM ingestion_staging
  WHERE enriched_data ? 'quality_rejudge'
    AND enriched_data->>'quality_pipeline_version' = 'podcast-deterministic.v1'
    AND enriched_data ? 'auto_publish_blocked_reasons';

  UPDATE ingestion_staging s
  SET enriched_data = s.enriched_data - 'auto_publish' - 'auto_publish_blocked_reasons',
      updated_at    = now()
  WHERE s.enriched_data ? 'quality_rejudge'
    AND s.enriched_data->>'quality_pipeline_version' = 'podcast-deterministic.v1'
    AND s.enriched_data ? 'auto_publish_blocked_reasons'
    -- The pre-reset values survive here, so this removes nothing unrecorded.
    AND s.enriched_data->'quality_retracted' ? 'blocked_reasons';

  GET DIAGNOSTICS v_fixed = ROW_COUNT;

  SELECT count(*) INTO v_after
  FROM ingestion_staging
  WHERE enriched_data ? 'quality_rejudge'
    AND enriched_data->>'quality_pipeline_version' = 'podcast-deterministic.v1'
    AND enriched_data ? 'auto_publish_blocked_reasons';

  RAISE NOTICE 'stale auto_publish on podcast-deterministic rows: % -> % (fixed %)',
    v_before, v_after, v_fixed;

  IF v_after > 0 THEN
    RAISE EXCEPTION
      'postcondition failed: % podcast-deterministic row(s) still carry a stale '
      'auto_publish_blocked_reasons', v_after;
  END IF;

  -- Mirror assertion: the LLM path must KEEP its reasons. A repair that cleared
  -- both paths would also satisfy the check above.
  IF NOT EXISTS (
    SELECT 1 FROM ingestion_staging
    WHERE enriched_data ? 'quality_rejudge'
      AND enriched_data->>'quality_pipeline_version' = 'news-quality.2026.04.27.0'
      AND enriched_data->'auto_publish_blocked_reasons' <> '[]'::jsonb
  ) THEN
    RAISE EXCEPTION
      'postcondition failed: the LLM path lost its blocked_reasons — this repair '
      'must not touch rows whose current verdict wrote them';
  END IF;
END
$repair$;
