-- Restore the news quality verdicts that something overwrote out of band, and
-- make the overwrite detectable from now on.
--
-- THE STATE: 88 `ingestion_staging` rows (target_table='news_articles') carry
-- `enriched_data->>'quality_status' = 'passed'` while `auto_publish` is false and
-- `auto_publish_blocked_reasons` is non-empty. `evaluatePublishGate`
-- (supabase/functions/_shared/news-quality/decision.ts) returns 'passed' ONLY on
-- `blockedReasons.length === 0`, so the gate cannot have produced it.
--
-- THE WRITER IS NOT IN THIS REPO, and three measurements say so:
--
--   1. Exactly ONE function in the database can write `enriched_data` —
--      `apply_enrichment`. Scanned every non-catalog pg_proc for
--      `enriched_data\s*:?=`: one hit. No trigger, no commit RPC, no triage RPC.
--   2. `enrichment_audit` records the LAST `quality-enhance` write for all 88 as
--      `rejected` (43) or `review` (45), with exactly the reasons still on the
--      row. Nothing wrote `enriched_data` afterwards.
--   3. They committed anyway, on 2026-08-28 20:52–20:53. Commit requires
--      `quality_status NOT IN ('rejected','review')`, so the flip PRECEDED the
--      commit and is what unblocked it — some time between the last gate write
--      (2026-08-27 17:30) and the commit sweep.
--
-- So this was an ad-hoc service-role / Management-API UPDATE, unattributed. Git
-- history contains no statement of that shape.
--
-- WHAT ACTUALLY PUBLISHED — and it is NOT what it first looked like. The rows are
-- not "commit-eligible junk with no title and no body": `news_commit_staging_batch`
-- reads `normalized_data`, not `quality_decision`, so all 88 committed with real
-- titles and bodies (36–8,779 chars). 24 of them do carry the empty-extraction
-- decision shape (title/excerpt/cleanedBody all '', confidence 0) — that is the
-- LLM having returned nothing, and commit simply fell back to the normalized text.
--
-- The harm is the verdict, not the text: 87 of the 88 are live and
-- seo_indexable, all from PubMed (NCBI) and Nature, 51 flagged `low_relevance`,
-- published as LGBTQ+ news — "Salivary Osmolality, Function, and Hydration
-- Habits", "Management of incidental brain tumors in children", "'Previously
-- unnoticed' glands found in human head".
--
-- THE REPAIR RESTORES THE VERDICT AND TOUCHES NO CONTENT. `title`, `content`,
-- `excerpt` and `image_url` are left exactly as they are — the text was never the
-- thing that was wrong, and the gate's verdict is recoverable from the audit
-- while overwritten prose would not be. Deindexing is not performed directly
-- either: `trg_news_enforce_seo_indexable` forces `seo_indexable=false` whenever
-- `quality_status IN ('rejected','review')`, so writing the status is enough, and
-- the postcondition below ASSERTS the trigger did it rather than assuming it.
--
-- Every row is then re-enqueued into `quality_backfill_jobs` with dry_run=false.
-- That is the only re-judge path for a COMMITTED article (`news-quality-backfill`
-- re-runs the same gate against `news_articles` and heals geo links too); the
-- `news_verdict_geo_backfill` cron drains 24 per 10 minutes, so 88 rows clear in
-- roughly 40 minutes. Side effect worth knowing: that cron skips its enqueue leg
-- while `pending >= 60`, so auto-enqueue pauses for one or two cycles.
--
-- THE SENTINEL IS STAGING-ONLY, AND THAT SCOPING IS LOAD-BEARING. On
-- `news_articles`, `quality_status='passed'` with non-empty
-- `auto_publish_blocked_reasons` is LEGITIMATE — it is what
-- `batch_approve_safe_news` writes when a human approves despite the reasons —
-- and there are 5,930 such rows (2,108 indexable) going back to 2025-07-14. A
-- zero-invariant on the article column would fire on all of them. On staging the
-- gate is the only writer, so there the state is unreachable by construction.
--
-- The sharper of the two counters is `verdict_overwritten`: current status vs the
-- last verdict `enrichment_audit` recorded for that row. Measured corpus-wide
-- before writing this — 12,811 news staging rows carry both, exactly 88 disagree,
-- and every disagreement is `rejected -> passed` or `review -> passed`. It also
-- catches a flip that cleared the reasons on its way through, which the
-- status-vs-reasons counter cannot see.
--
-- BOTH INVARIANTS ARE SCOPED TO THE GATE'S OWN `quality_pipeline_version`, and
-- that is not defensive dressing — two PRs in flight make the unscoped form
-- cry wolf, and one of them would make THIS FILE abort and block `db push` for
-- the whole repo:
--
--   * #3667 (`40500101100000`, sorts BELOW this file, so it applies first)
--     RETRACTS an empty-extraction verdict by deleting `quality_status` and
--     `quality_decision` so the row re-enters quality-enhance. The audit row
--     survives, so `current IS DISTINCT FROM audited` is TRUE for a row that is
--     correctly awaiting re-judge. Hence every check here requires the row to
--     actually CARRY a verdict (`? 'quality_status'`). Its cohort is otherwise
--     disjoint from this one: it excludes `disposition IN ('inserted','updated')`
--     and all 88 of these are published.
--   * #3664 (`45000101100000`) stamps `quality_status='passed'` deterministically
--     for curated podcast shows, deliberately routing around the LLM, and marks
--     it `quality_pipeline_version='podcast-deterministic.v1'`. Chained after
--     #3667 — which leaves `auto_publish_blocked_reasons` standing while removing
--     the status — that yields a legitimate row which is both 'passed' with
--     reasons AND disagreeing with its audit, i.e. it trips BOTH invariants.
--
-- So the invariant is narrower than "status disagrees with the audit": it is *a
-- row that claims the LLM gate judged it, disagreeing with what the gate
-- actually recorded*. A declared non-gate verdict carries its own version and is
-- out of scope; an ad-hoc UPDATE that flips the status without touching the
-- version — exactly what happened to these 88, which still read
-- 'news-quality.2026.04.27.0' — is still caught. Measured on prod: the scoped
-- predicate returns the same 88 as the unscoped one, so the narrowing costs no
-- detection today. An avoid-rule that fires on correct work teaches people to
-- scroll past the sentinel.
--
-- LIMIT, STATED RATHER THAN IMPLIED: `ingestion_staging_retention` deletes at 90
-- days and cascades, so a staging row and its audit rows age out together and the
-- sentinel's detection window is bounded by that. The permanent record of this
-- repair therefore lives on `news_articles.enrichment_status->'verdict_restore'`,
-- which retention does not touch.

DO $restore$
DECLARE
  v_cohort      int;
  v_staging     int;
  v_articles    int;
  v_jobs        int;
  v_left        int;
  v_indexable   int;
BEGIN
  CREATE TEMP TABLE _verdict_restore ON COMMIT DROP AS
  WITH last_gate AS (
    SELECT DISTINCT ON (a.staging_id)
           a.staging_id,
           a.after_data->>'quality_status' AS gate_verdict
    FROM public.enrichment_audit a
    WHERE a.stage = 'quality-enhance'
      AND a.after_data ? 'quality_status'
    ORDER BY a.staging_id, a.created_at DESC
  )
  SELECT s.id                                AS staging_id,
         s.target_record_id                  AS article_id,
         s.enriched_data->>'quality_status'  AS current_verdict,
         g.gate_verdict
  FROM public.ingestion_staging s
  JOIN last_gate g ON g.staging_id = s.id
  WHERE s.target_table = 'news_articles'
    AND g.gate_verdict IN ('rejected', 'review')
    -- Same two scopings as the postcondition, and here they protect other
    -- people's work rather than this file: without the version test a #3664
    -- deterministic 'passed' whose audit reads 'rejected' would be "restored"
    -- to rejected, silently undoing a legitimate verdict.
    AND s.enriched_data ? 'quality_status'
    AND s.enriched_data->>'quality_pipeline_version' = 'news-quality.2026.04.27.0'
    AND s.enriched_data->>'quality_status' IS DISTINCT FROM g.gate_verdict;

  SELECT count(*) INTO v_cohort FROM _verdict_restore;
  RAISE NOTICE 'verdict restore: % staging rows carry a verdict the gate never issued', v_cohort;

  -- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. An exact-count premise
  -- (`must be 88`) aborts on a correct tree the moment retention or a sibling
  -- session moves a row, and an abort here blocks every migration queued behind
  -- it. A re-run is a no-op; the assertions at the bottom are what this file
  -- exists to guarantee.
  IF v_cohort > 0 THEN
    UPDATE public.ingestion_staging s
       SET enriched_data = s.enriched_data || jsonb_build_object(
             'quality_status', r.gate_verdict,
             'quality_verdict_restored', jsonb_build_object(
               'overwritten_value', r.current_verdict,
               'restored_to',       r.gate_verdict,
               'restored_at',       now(),
               'evidence',          'enrichment_audit, stage=quality-enhance, last write',
               'migration',         '41000101100000')),
           updated_at = now()
      FROM _verdict_restore r
     WHERE s.id = r.staging_id;
    GET DIAGNOSTICS v_staging = ROW_COUNT;

    -- Content columns are deliberately absent from this SET list.
    UPDATE public.news_articles a
       SET quality_status   = r.gate_verdict,
           needs_attention  = true,
           enrichment_status = coalesce(a.enrichment_status, '{}'::jsonb) || jsonb_build_object(
             'verdict_restore', jsonb_build_object(
               'prev_quality_status', a.quality_status,
               'prev_seo_indexable',  a.seo_indexable,
               'prev_blocked_reasons', to_jsonb(a.auto_publish_blocked_reasons),
               'restored_to',         r.gate_verdict,
               'restored_at',         now(),
               'staging_id',          r.staging_id,
               'migration',           '41000101100000'))
      FROM _verdict_restore r
     WHERE a.id = r.article_id;
    GET DIAGNOSTICS v_articles = ROW_COUNT;

    INSERT INTO public.quality_backfill_jobs (article_id, status, mode, dry_run, pipeline_version)
    SELECT r.article_id, 'pending', 'backfill', false, 'news-quality.2026.04.27.0'
    FROM _verdict_restore r
    WHERE r.article_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.quality_backfill_jobs j
        WHERE j.article_id = r.article_id AND j.status IN ('pending', 'running'));
    GET DIAGNOSTICS v_jobs = ROW_COUNT;

    RAISE NOTICE 'restored % staging rows, % articles, enqueued % re-judge jobs',
      v_staging, v_articles, v_jobs;
  END IF;

  -- POSTCONDITION 1 — no staging row disagrees with its own audited verdict.
  -- Global, not scoped to the temp table, so a row that arrived mid-migration is
  -- reported rather than skipped.
  SELECT count(*) INTO v_left
  FROM public.ingestion_staging s
  JOIN (
    SELECT DISTINCT ON (a.staging_id) a.staging_id, a.after_data->>'quality_status' AS gate_verdict
    FROM public.enrichment_audit a
    WHERE a.stage = 'quality-enhance' AND a.after_data ? 'quality_status'
    ORDER BY a.staging_id, a.created_at DESC
  ) g ON g.staging_id = s.id
  WHERE s.target_table = 'news_articles'
    -- Must CARRY a verdict. A row whose verdict #3667 retracted for re-judge has
    -- no `quality_status` and a surviving audit row; without this the postcondition
    -- aborts on correct work and blocks every migration queued behind this one.
    AND s.enriched_data ? 'quality_status'
    -- Must CLAIM the gate issued it. A declared deterministic verdict (#3664)
    -- carries its own version and is not an out-of-band flip.
    AND s.enriched_data->>'quality_pipeline_version' = 'news-quality.2026.04.27.0'
    AND s.enriched_data->>'quality_status' IS DISTINCT FROM g.gate_verdict;
  IF v_left > 0 THEN
    RAISE EXCEPTION 'verdict restore incomplete: % news staging rows still disagree with enrichment_audit', v_left;
  END IF;

  -- POSTCONDITION 2 — the deindex actually happened. This asserts
  -- trg_news_enforce_seo_indexable rather than trusting it: if that trigger is
  -- ever dropped, this migration must fail loudly instead of leaving 87
  -- rejected-but-indexable articles live.
  SELECT count(*) INTO v_indexable
  FROM public.news_articles a
  JOIN _verdict_restore r ON r.article_id = a.id
  WHERE a.seo_indexable IS TRUE;
  IF v_indexable > 0 THEN
    RAISE EXCEPTION 'trg_news_enforce_seo_indexable left % restored articles indexable', v_indexable;
  END IF;
END $restore$;

-- ---------------------------------------------------------------------------
-- Sentinel
-- ---------------------------------------------------------------------------
--
-- Standalone, not a new key on pipeline_hygiene_stats(): adding one there means
-- restating that whole function body, which is a merge-collision surface — the
-- reason event_dup_signals / venue_dup_signals / news_image_signals are all
-- separate.
--
-- SECURITY INVOKER and service_role only. It returns counts, never rows, and
-- `ingestion_staging` is not anon-readable; making it DEFINER by reflex is how
-- _dedup_venue_cluster_side leaked safety-gated events to anon.
CREATE OR REPLACE FUNCTION public.news_quality_verdict_signals()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH last_gate AS (
    SELECT DISTINCT ON (a.staging_id) a.staging_id, a.after_data->>'quality_status' AS gate_verdict
    FROM public.enrichment_audit a
    WHERE a.stage = 'quality-enhance' AND a.after_data ? 'quality_status'
    ORDER BY a.staging_id, a.created_at DESC
  ), rows AS (
    SELECT s.enriched_data->>'quality_status' AS cur,
           g.gate_verdict,
           jsonb_array_length(coalesce(s.enriched_data->'auto_publish_blocked_reasons', '[]'::jsonb)) AS nreasons,
           -- Does this row CLAIM the LLM gate judged it? A deterministic verdict
           -- (#3664: 'podcast-deterministic.v1') is a declared non-gate write and
           -- neither invariant applies to it. See the header.
           (s.enriched_data->>'quality_pipeline_version' = 'news-quality.2026.04.27.0') AS claims_gate
    FROM public.ingestion_staging s
    LEFT JOIN last_gate g ON g.staging_id = s.id
    WHERE s.target_table = 'news_articles'
      -- A row whose verdict was retracted for re-judge (#3667) carries no status
      -- and is not a contradiction — it is work in progress.
      AND s.enriched_data ? 'quality_status'
  )
  SELECT jsonb_build_object(
    -- Positive controls. An empty table, a renamed stage and a clean corpus all
    -- return zero for the two invariants; these say which one you are looking at.
    'rows_scanned',     count(*),
    'with_gate_audit',  count(gate_verdict),
    -- A fourth control: if a future writer stops stamping the gate's version,
    -- both invariants below quietly scope themselves to nothing.
    'claiming_gate',    count(*) FILTER (WHERE claims_gate),
    -- Zero-invariants. Both scoped to rows claiming the gate — see the header.
    'verdict_overwritten',         count(*) FILTER (WHERE claims_gate
                                                     AND gate_verdict IS NOT NULL
                                                     AND cur IS DISTINCT FROM gate_verdict),
    'passed_with_blocked_reasons', count(*) FILTER (WHERE claims_gate
                                                     AND cur = 'passed' AND nreasons > 0),
    -- Advisory: rows whose audit has aged out under the 90-day retention, or
    -- that predate stage-level auditing. Unverifiable, not wrong.
    'unverifiable_no_audit',       count(*) FILTER (WHERE gate_verdict IS NULL)
  )
  FROM rows;
$$;

REVOKE ALL ON FUNCTION public.news_quality_verdict_signals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.news_quality_verdict_signals() FROM anon;
REVOKE ALL ON FUNCTION public.news_quality_verdict_signals() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.news_quality_verdict_signals() TO service_role;

COMMENT ON FUNCTION public.news_quality_verdict_signals() IS
  'Zero-invariant sentinel: a news staging row whose quality_status disagrees with the last verdict enrichment_audit recorded for it, or that says passed while carrying blocked reasons. evaluatePublishGate cannot produce either, and apply_enrichment is the only function that can write enriched_data, so a non-zero count is a writer outside the pipeline. STAGING ONLY — on news_articles passed+reasons is a legitimate human batch-approve override (5,930 rows).';
