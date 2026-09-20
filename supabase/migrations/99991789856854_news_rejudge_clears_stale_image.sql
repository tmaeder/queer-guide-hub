-- ============================================================================
-- The re-judge carried a stale STOCK PHOTO past the verdict that chose it,
-- and 128 published podcast episodes are wearing one.
-- ----------------------------------------------------------------------------
-- This is the same defect as 99980101100001 (stale auto_publish), one field
-- over, and finding it the same way -- by looking at what actually reached a
-- reader -- is the reason it is fixed here rather than counted.
--
-- run_news_quality_rejudge strips the verdict keys. It does NOT strip the
-- IMAGE keys the verdict produced: image_url, image_attribution,
-- quality_image_replaced, quality_image_probe.
--
-- On a row the LLM path re-judges that is invisible: pipeline-quality-enhance
-- re-runs the probe and rewrites them. On a row the PODCAST-DETERMINISTIC path
-- (50000301100000) takes, it is not -- that path writes no image keys at all,
-- deliberately, because its whole point is that a podcast row already carries
-- its own artwork and should keep it. Its header says so in as many words:
--
--   "commit prefers enriched_data.image_url then normalized_data.image_url, so
--    skipping the LLM means an episode keeps its own artwork instead of
--    gaining a stock photo."
--
-- That holds for a fresh row. It does not hold for a row I reset, because the
-- Pexels URL written by the ORIGINAL LLM verdict -- months earlier, before the
-- artwork fix existed -- was still sitting in enriched_data.image_url, and
-- commit prefers exactly that key.
--
-- MEASURED ON PROD:
--
--   published from the re-judge                       137
--   carrying a Pexels stock photo                     132
--   ... despite the staging row having its own art    130
--   ... whose Pexels URL PREDATES the re-judge        128   <- stale, repaired
--   ... written by a probe AFTER the re-judge           2   <- correct, kept
--
-- The 2 are genuine: probe_reason='not_image', probe ok=false, both news
-- articles from attitude.co.uk whose source image really did fail. Replacing
-- those was the right call and this migration does not touch them. A repair
-- that cleared all 130 would look identical in the counters and would be
-- wrong, which is why the predicate is staleness and not "is a Pexels URL".
--
-- READER-VISIBLE. Unlike the auto_publish defect, this one reached the page:
-- 128 indexable podcast episodes are published with a random stock photo in
-- place of their show artwork, and that image is what og:image serves to
-- crawlers.
--
-- REPAIR SCOPE. Only rows where the article STILL carries the exact Pexels URL
-- that enriched_data holds -- proof that nothing has overwritten it since, so
-- no human edit is destroyed. image_attribution is cleared with it (a Pexels
-- credit on the show's own artwork is a false statement about provenance) and
-- image_hash is nulled because it describes the image being removed; leaving a
-- stock photo's hash behind would let dedup match on an image the row no
-- longer has.
--
-- Soft on preconditions, hard on postconditions: CREATE OR REPLACE over
-- whatever is live, asserts nothing about the prior body, re-runnable.
-- ============================================================================

-- Part 1 -- the producer. The image keys belong to the verdict that chose them.
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
        -- Everything the retracted verdict produced goes with it. The image
        -- keys matter as much as the status: commit prefers
        -- enriched_data.image_url, and the podcast-deterministic path writes no
        -- image keys at all, so a stale stock photo left here outlives the
        -- verdict that chose it and reaches the page.
        (s.enriched_data
           - 'quality_status'
           - 'quality_decision'
           - 'auto_publish'
           - 'auto_publish_blocked_reasons'
           - 'image_url'
           - 'image_attribution'
           - 'quality_image_replaced'
           - 'quality_image_probe')
        || jsonb_build_object(
             'quality_retracted', jsonb_build_object(
               'status',            s.enriched_data->>'quality_status',
               'decision',          s.enriched_data->'quality_decision',
               'auto_publish',      s.enriched_data->'auto_publish',
               'blocked_reasons',   s.enriched_data->'auto_publish_blocked_reasons',
               'image_url',         s.enriched_data->'image_url',
               'image_attribution', s.enriched_data->'image_attribution',
               'image_replaced',    s.enriched_data->'quality_image_replaced',
               'pipeline_version',  s.enriched_data->>'quality_pipeline_version',
               'run_at',            s.enriched_data->>'quality_run_at'),
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

-- Part 2 -- give the 128 published episodes their own artwork back.
DO $repair$
DECLARE
  v_before  integer;
  v_fixed   integer;
  v_after   integer;
  v_control integer;
BEGIN
  -- NOTE ON THE PREDICATE. These rows were reset by the PREVIOUS version of the
  -- function, which stashed no image keys -- quality_retracted->>'image_url' is
  -- NULL on every one of them, so keying the repair on the stash would match
  -- nothing while every count still looked plausible. The evidence that exists
  -- on these rows is the pair of timestamps: a replacement that happened BEFORE
  -- the reset belongs to the retracted verdict.
  SELECT count(*) INTO v_before
  FROM ingestion_staging s JOIN news_articles n ON n.id = s.target_record_id
  WHERE s.enriched_data ? 'quality_rejudge' AND s.disposition = 'inserted'
    AND n.image_url LIKE '%pexels%'
    AND s.normalized_data->'metadata'->>'image_url' IS NOT NULL
    AND (s.enriched_data->'quality_image_replaced'->>'replaced_at')::timestamptz
        < (s.enriched_data->'quality_rejudge'->>'at')::timestamptz;

  UPDATE news_articles n
  SET image_url         = s.normalized_data->'metadata'->>'image_url',
      image_attribution = NULL,
      image_hash        = NULL,
      updated_at        = now()
  FROM ingestion_staging s
  WHERE n.id = s.target_record_id
    AND s.enriched_data ? 'quality_rejudge'
    AND s.disposition = 'inserted'
    AND s.normalized_data->'metadata'->>'image_url' IS NOT NULL
    -- Staleness, not "is a Pexels URL": the replacement must predate the reset.
    -- The 2 rows whose probe legitimately failed AFTER the re-judge keep theirs.
    AND (s.enriched_data->'quality_image_replaced'->>'replaced_at')::timestamptz
        < (s.enriched_data->'quality_rejudge'->>'at')::timestamptz
    -- The article must still carry exactly the URL that verdict chose, so
    -- nothing written since -- by a human or another job -- is overwritten.
    AND n.image_url = (s.enriched_data->>'image_url');

  GET DIAGNOSTICS v_fixed = ROW_COUNT;

  SELECT count(*) INTO v_after
  FROM ingestion_staging s JOIN news_articles n ON n.id = s.target_record_id
  WHERE s.enriched_data ? 'quality_rejudge' AND s.disposition = 'inserted'
    AND n.image_url LIKE '%pexels%'
    AND s.normalized_data->'metadata'->>'image_url' IS NOT NULL
    AND (s.enriched_data->'quality_image_replaced'->>'replaced_at')::timestamptz
        < (s.enriched_data->'quality_rejudge'->>'at')::timestamptz;

  -- Mirror control: the rows whose probe genuinely failed after the re-judge
  -- must KEEP their replacement. A repair that cleared every Pexels URL would
  -- satisfy the check above and silently strip two correct substitutions.
  SELECT count(*) INTO v_control
  FROM ingestion_staging s JOIN news_articles n ON n.id = s.target_record_id
  WHERE s.enriched_data ? 'quality_rejudge' AND s.disposition = 'inserted'
    AND n.image_url LIKE '%pexels%'
    AND (s.enriched_data->'quality_image_probe'->>'reason') = 'not_image';

  RAISE NOTICE 'stale stock photos on published re-judged rows: % -> % (fixed %); correct replacements kept: %',
    v_before, v_after, v_fixed, v_control;

  IF v_after > 0 THEN
    RAISE EXCEPTION 'postcondition failed: % published row(s) still wear a stale stock photo', v_after;
  END IF;

  IF v_control = 0 THEN
    RAISE EXCEPTION
      'postcondition failed: the legitimately-replaced rows lost their image — '
      'this repair must only touch replacements that predate the re-judge';
  END IF;
END
$repair$;
