-- ============================================================================
-- run_news_quality_rejudge: never reset a row that has been superseded.
-- ----------------------------------------------------------------------------
-- 50000601100000 shipped this function with a cohort selected purely on the
-- VERDICT (blank decision -> rejected). Running it on prod 2026-09-14 failed
-- whole on
--
--   23505 duplicate key value violates unique constraint
--         "ux_ingestion_staging_source_idem"
--
-- and nothing was written. The constraint was right and the cohort was wrong.
--
-- WHY IT FIRED. The index is PARTIAL and excludes rejected rows:
--
--   CREATE UNIQUE INDEX ux_ingestion_staging_source_idem
--     ON ingestion_staging (COALESCE(source_name, source_type), idempotency_key)
--     WHERE idempotency_key IS NOT NULL AND disposition <> 'rejected';
--
-- A rejected row therefore sits OUTSIDE the index. The reset sets
-- disposition='pending', which pulls it IN -- and if any other row for the same
-- (source, idempotency_key) is already non-rejected, the two now collide. That
-- other row is a newer staging attempt for the same article.
--
-- MEASURED ON PROD before this migration, over the blank-decision cohort:
--
--   disposition   rows   would collide   safe
--   rejected       755        514         241
--   pending        359          0         359
--   inserted        51          0          51
--   committed        8          0           8
--   updated          8          0           8
--
-- So 514 of the rejected rows are ALREADY SUPERSEDED: a later row for the same
-- article is pending, inserted or committed. Those must never be re-judged --
-- at best it repeats work already done, and for the `inserted` ones it risks a
-- second copy of a live article. They were only ever in the eligible set
-- because the cohort asked "what was the verdict" and never "is this row still
-- the current attempt at this article".
--
-- A SECOND, SMALLER CASE the first fix does not cover: among the 241 rows that
-- have no live sibling, 31 (src, idempotency_key) groups hold 81 rows that
-- collide WITH EACH OTHER. Excluding live siblings is not enough; the cohort
-- must also be unique on the index key by itself. The newest row per key wins
-- (created_at DESC, id DESC) -- for two staging attempts at one article the
-- later fetch is the better candidate to re-judge.
--
-- NULL idempotency_key rows are kept unconditionally: the index is partial on
-- `idempotency_key IS NOT NULL`, so they cannot collide, and a PARTITION BY
-- over NULL would otherwise collapse them all to a single survivor. Measured 0
-- such rows in this cohort today; the branch is there so the rule stays true
-- when that changes.
--
-- WHY THE DRY RUN DID NOT CATCH ANY OF THIS. It counts rows and returns; it
-- never performs the UPDATE, so no constraint is ever evaluated. It reported
-- `eligible: 874, would_reset: 500` when the writable set was 600. A dry run
-- that does not write cannot surface a write-time conflict -- so it now reports
-- `superseded` and `intra_cohort_dupes` explicitly, and `eligible` counts only
-- rows that can actually be written. The number it prints is the number that
-- will move.
--
-- Soft on preconditions, hard on postconditions: this is CREATE OR REPLACE over
-- whatever is live, asserts nothing about the prior body, and re-asserts its own
-- invariants at the end. Re-running it is a no-op.
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

  -- Everything the verdict test selects, before any supersede reasoning.
  CREATE TEMP TABLE _rejudge_raw ON COMMIT DROP AS
  SELECT s.id,
         s.idempotency_key,
         coalesce(s.source_name, s.source_type) AS src,
         s.created_at,
         (s.disposition = 'rejected'
          AND s.review_notes LIKE 'auto: LLM relevance/quality rejected%') AS is_group_a,
         -- A row for this same article that is already inside the partial
         -- unique index. Un-rejecting this row would collide with it.
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

  -- Writable cohort: not superseded, and unique on the index key.
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

  -- Pre-write assertion. The UPDATE would raise 23505 anyway; this makes the
  -- reason legible and names the rows, instead of a bare constraint name.
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
    'superseded_skipped', v_superseded,
    'intra_cohort_dupes_skipped', v_dupes,
    'reset', v_reset,
    'remaining', greatest(v_eligible - v_reset, 0),
    'drain', 'news_orphan_reclaim (hourly :30) re-judges oldest-first'
  );
END;
$function$;

COMMENT ON FUNCTION public.run_news_quality_rejudge(integer, boolean, boolean) IS
  'Re-judge news staging rows rejected on an empty extraction. Skips rows superseded '
  'by a newer non-rejected row for the same (source, idempotency_key), and keeps one '
  'row per key, because ux_ingestion_staging_source_idem excludes disposition=rejected '
  'and un-rejecting a row pulls it into that index. service_role only.';

REVOKE ALL ON FUNCTION public.run_news_quality_rejudge(integer, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_news_quality_rejudge(integer, boolean, boolean) TO service_role;

-- Dry run only. Reports; writes nothing; never blocks the deploy.
DO $verify$
DECLARE r jsonb;
BEGIN
  r := public.run_news_quality_rejudge(p_dry_run => true);
  RAISE NOTICE 'rejudge cohort after supersede guard: eligible=% superseded_skipped=% intra_cohort_dupes_skipped=%',
    r->>'eligible', r->>'superseded_skipped', r->>'intra_cohort_dupes_skipped';

  IF (r->>'superseded_skipped')::int = 0 AND (r->>'eligible')::int = 0 THEN
    RAISE NOTICE 'nothing eligible and nothing superseded — cohort already drained';
  END IF;
END
$verify$;
