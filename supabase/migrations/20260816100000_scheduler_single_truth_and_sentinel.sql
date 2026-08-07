-- ============================================================================
-- Scheduler single source of truth + starved-path sentinel — overhaul Phase 2
-- ----------------------------------------------------------------------------
-- 1. Retire the mp-drain-commit HTTP cron. Marketplace commits run twice an
--    hour today: mp-drain-commit (:45, net.http_post → pipeline-commit, batch
--    ≤200 under the PostgREST ~8s ceiling) AND marketplace_commit_drain (:40,
--    pure SQL run_marketplace_commit_drain(1500) under a DB-owned 540s
--    timeout). The SQL drain strictly dominates; precondition verified live
--    2026-08-07: 171/171 'success' runs over the last 7 days, zero failures.
--    Retirement follows the 20260813100000 pattern — registry row DISABLED
--    first (sync_automations_to_cron branch (d) re-arms any enabled row whose
--    command is missing from cron.job; branch (b) is the kill switch), then a
--    guarded unschedule. Never DELETE the row.
-- 2. Declare admin_automations the only source of schedule truth: the
--    schedule columns on workflow_definitions / pipeline_definitions are
--    informational. They are NOT nulled here — workflow-dispatcher's health
--    check still reads workflow_definitions.schedule, and pipeline_definitions
--    .schedule accurately describes DAG-start cron cadence until Phase 6
--    demotes those schedules. Nulling happens there, with its consumers.
-- 3. pipeline_hygiene_stats gains stale_pending_by_entity + reindex queue
--    depth — the generalized sentinel for the failure mode that created the
--    drain-cron layer in the first place (rows staged outside a pipeline run
--    silently never draining). CI (check-pipeline-health.mjs) consumes it.
--    Live baseline 2026-08-07 (pre-existing, NOT a regression):
--    news_article(s) 1,876 · marketplace 872 (oldest 2026-06) · events 34 ·
--    venue 6 — thresholds are set above this so only NEW starvation fails.
-- ============================================================================

-- (1) mp-drain-commit retirement
UPDATE public.admin_automations
   SET enabled = false,
       description = description || ' [RETIRED 2026-08 overhaul P2: superseded by the pure-SQL marketplace_commit_drain (:40, batch 1500, 540s DB timeout); this HTTP path committed ≤200/run under the PostgREST 8s ceiling. Verified 171/171 successful SQL-drain runs over 7 days before retirement.]'
 WHERE slug = 'mp_drain_commit';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mp-drain-commit') THEN
    PERFORM cron.unschedule('mp-drain-commit');
  END IF;
END $$;

-- (2) schedule-truth declaration
COMMENT ON COLUMN public.workflow_definitions.schedule IS
  'DEPRECATED (2026-08 overhaul P2): informational only. Schedules live in admin_automations (registry of record) → pg_cron via sync_automations_to_cron(). Still read by workflow-dispatcher''s 25h health check; nulled per-workflow when Phase 6 retires the corresponding cron.';

COMMENT ON COLUMN public.pipeline_definitions.schedule IS
  'DEPRECATED (2026-08 overhaul P2): informational only — editing it (Builder ScheduleDialog) changes NO scheduling; DAG starts are pg_cron jobs governed by admin_automations. Nulled per-pipeline when Phase 6 demotes DAGs to manual runs.';

-- (3) starved-path sentinel
CREATE OR REPLACE FUNCTION public.pipeline_hygiene_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'cron_total', (SELECT count(*) FROM cron.job WHERE active),
    'legacy_cron_jobs', COALESCE((
      SELECT jsonb_agg(jobname) FROM cron.job
      WHERE jobname IN (
        'pipeline-venue-validate', 'pipeline-venue-dedup', 'pipeline-venue-commit',
        'pipeline-event-validate', 'pipeline-event-dedup', 'pipeline-event-commit'
      )
      OR jobname LIKE 'translate-i18n-%'
      OR jobname LIKE 'tag\_i18n\_%' ESCAPE '\'
    ), '[]'::jsonb),
    'i18n_percombo_cron_count', (
      SELECT count(*) FROM cron.job
      WHERE jobname LIKE 'i18n\_%' ESCAPE '\'
        AND jobname NOT IN ('i18n_translation_dispatch')
    ),
    'staging_pending_review', (
      SELECT count(*) FROM public.ingestion_staging
      WHERE review_status = 'pending_review' AND disposition = 'pending'
    ),
    'unregistered_cron_jobs', COALESCE((
      SELECT jsonb_agg(j.jobname) FROM cron.job j
      WHERE j.active
        AND NOT EXISTS (
          SELECT 1 FROM public.admin_automations a
          WHERE a.action->>'jobname' = j.jobname
             OR a.slug = lower(regexp_replace(j.jobname, '[^a-zA-Z0-9]+', '_', 'g'))
        )
    ), '[]'::jsonb),
    -- 2026-08 overhaul P2: rows stuck mid-pipeline. This is the generalized
    -- form of the leak that spawned the per-stage drain crons (rows staged
    -- outside a pipeline run never draining). Keyed by target_table (the
    -- router key; entity_type spellings are inconsistent in old rows).
    'stale_pending_by_entity', COALESCE((
      SELECT jsonb_object_agg(target_table, n) FROM (
        SELECT target_table, count(*) AS n
        FROM public.ingestion_staging
        WHERE disposition = 'pending'
          AND created_at < now() - interval '48 hours'
        GROUP BY target_table
      ) s
    ), '{}'::jsonb),
    'search_reindex_queue_depth', (
      SELECT count(*) FROM public.search_reindex_queue
    )
  );
$$;
