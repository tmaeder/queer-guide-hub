-- ============================================================================
-- Drain the news commit backlog that the hot path deliberately abandoned.
-- ----------------------------------------------------------------------------
-- news_commit_staging_batch is scoped `WHERE job_id = p_job_id`, and its only
-- caller for news is pipeline-commit, which picks job_ids like this:
--
--   .eq('disposition','pending').order('created_at', desc).limit(50)
--
-- That ordering is CORRECT and must not be reverted. Its own comment records
-- why: an UNORDERED limit(50) returned the oldest pending rows, so every hour
-- the same three-week-old job_ids were handed to the RPC, skipped, and left
-- pending — while freshly approved articles queued behind them and never
-- committed at all. Newest-first guarantees new articles are always inside the
-- window. The comment is explicit about the cost it accepted:
--
--   "The stale backlog stops being drained by this path, but it was never being
--    drained — it was only blocking."
--
-- This migration pays that cost off, without touching the hot path. A separate
-- oldest-first drain, on its own cron, works the tail while pipeline-commit
-- keeps the head. Two jobs rather than one merged selector, because a single
-- query cannot be both newest-first and oldest-first, and interleaving inside
-- pipeline-commit would put the hard-won head behaviour back at risk.
--
-- Measured on prod 2026-09-02, applying the RPC's own predicate to every pending
-- news row: 2,176 rows across 190 jobs are commit-eligible but starved. Of those
-- 541 carry quality_status='passed' (vetted, human-cleared, back to 2026-07-14)
-- and 1,635 carry no verdict at all.
--
-- ONLY THE VETTED 541 ARE TARGETED, and the ordering of the two migrations in
-- this pair is what makes that safe. 20261212114700 adds the verdict gate to the
-- RPC, so an unjudged row can no longer commit. Without it this drain would
-- publish 465 unjudged rows as collateral — they share job_ids with the vetted
-- ones, and the RPC commits per JOB, not per row, so the drain cannot exclude
-- them by itself. The gate is what makes a job-scoped drain safe; do not run
-- this one without it.
--
-- The job selection below ALSO requires a non-empty verdict, so the drain does
-- not waste RPC calls on jobs the gate would reject wholesale. The gate remains
-- the enforcement; this is only work-list hygiene.
--
-- Deliberately NOT run one-shot inside this migration. Committing ~541 articles
-- inside the migration transaction would lengthen a deploy that has been fragile
-- all day, and a failure would block the whole batch. The cron drains it in a
-- few passes instead.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_news_commit_backlog_drain(
  p_jobs  integer DEFAULT 20,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job      uuid;
  v_rec      record;
  v_jobs     integer := 0;
  v_inserted integer := 0;
  v_updated  integer := 0;
  v_skipped  integer := 0;
  v_errors   integer := 0;
BEGIN
  IF p_jobs IS NULL OR p_jobs < 1 OR p_jobs > 200 THEN
    RAISE EXCEPTION 'p_jobs must be between 1 and 200, got %', p_jobs;
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 1000, got %', p_limit;
  END IF;

  FOR v_job IN
    -- Oldest job first — the exact inverse of pipeline-commit's window, which is
    -- the point. Mirrors the RPC's predicate so the work list and the thing that
    -- does the work agree on what "eligible" means; the extra `<> ''` keeps
    -- unjudged-only jobs out of the list entirely.
    SELECT s.job_id
    FROM public.ingestion_staging s
    WHERE s.target_table = 'news_articles'
      AND s.disposition = 'pending'
      AND s.job_id IS NOT NULL
      AND coalesce(s.dedup_status, 'pending') IN ('pending','unique','merge_candidate','duplicate')
      AND coalesce(s.ai_validation_status, 'pending') IN ('pending','approved','needs_review')
      AND coalesce(s.review_status, 'auto') NOT IN ('pending_review','rejected')
      AND coalesce(s.enriched_data->>'quality_status', '') NOT IN ('rejected','review','')
    GROUP BY s.job_id
    ORDER BY min(s.created_at)
    LIMIT p_jobs
  LOOP
    SELECT * INTO v_rec
    FROM public.news_commit_staging_batch(v_job, NULL, p_limit);

    v_jobs     := v_jobs + 1;
    v_inserted := v_inserted + coalesce(v_rec.inserted, 0);
    v_updated  := v_updated  + coalesce(v_rec.updated,  0);
    v_skipped  := v_skipped  + coalesce(v_rec.skipped,  0);
    v_errors   := v_errors   + coalesce(v_rec.errors,   0);
  END LOOP;

  RETURN jsonb_build_object(
    'jobs', v_jobs, 'inserted', v_inserted, 'updated', v_updated,
    'skipped', v_skipped, 'errors', v_errors
  );
END;
$function$;

COMMENT ON FUNCTION public.run_news_commit_backlog_drain(integer, integer) IS
  'Oldest-first commit drain for the news staging tail that pipeline-commit''s newest-first job window deliberately abandons. Only ever offers jobs containing a non-empty quality verdict; the verdict gate in news_commit_staging_batch (20261212114700) is the actual enforcement and this must not run without it. See 20261212114800.';

REVOKE ALL ON FUNCTION public.run_news_commit_backlog_drain(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_news_commit_backlog_drain(integer, integer) TO service_role;

-- ----------------------------------------------------------------------------
-- Registry row FIRST, then the cron — admin_automations is the registry of
-- record, and a cron with no registry row is reported as unregistered by
-- pipeline_hygiene_stats() and hard-fails check-pipeline-health.mjs.
--
-- Minute 47: the news family already occupies :30 (news_fill_rss,
-- news_orphan_reclaim) and pipeline-commit runs on the DAG's own schedule, so a
-- late-hour offset keeps the tail drain clear of the head.
--
-- action.type = 'rpc' carries no action.command ON PURPOSE. sync_automations_to_cron()
-- branch (d) only recreates a MISSING cron for a row that has a command, so an
-- rpc row is scheduled by this migration and by nothing else — which is exactly
-- the trap documented for recovery: re-enabling such a row later leaves it
-- on-but-unscheduled and the cron must be recreated from here.
-- ----------------------------------------------------------------------------
INSERT INTO public.admin_automations
  (slug, name, description, trigger, conditions, schedule, action, enabled, auto_pause_threshold)
VALUES (
  'news_commit_backlog_drain',
  'News commit backlog drain',
  'Oldest-first commit pass over the news staging tail pipeline-commit''s newest-first window skips. Vetted rows only.',
  jsonb_build_object('type', 'schedule'),
  '[]'::jsonb,
  '47 * * * *',
  -- Key is `fn`, matching every other action->>'type'='rpc' row (e.g.
  -- tag_category_text_resync, city_completeness_recompute). A different key
  -- would leave the row unreadable to whatever reads the registry.
  jsonb_build_object('type', 'rpc', 'fn', 'run_news_commit_backlog_drain'),
  true,
  3
)
ON CONFLICT (slug) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      action   = EXCLUDED.action,
      enabled  = EXCLUDED.enabled;

SELECT cron.schedule(
  'news_commit_backlog_drain',
  '47 * * * *',
  $cron$SELECT public.admin_automation_run_begin('news_commit_backlog_drain'); SELECT public.run_news_commit_backlog_drain(20, 200);$cron$
);
