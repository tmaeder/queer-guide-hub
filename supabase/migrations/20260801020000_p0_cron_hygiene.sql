-- ============================================================================
-- Content-processing simplification P0.1 — cron hygiene
-- ----------------------------------------------------------------------------
-- 1. Defensively unschedule legacy per-stage pipeline crons (the pattern
--    cleanup migration 20260422010000 removed once; guard against return)
--    and the parked translate-i18n-* / tag_i18n_* job families that were
--    superseded by the i18n_<table>_<field>_<lang> jobs (themselves replaced
--    by the dispatcher in the companion migration).
-- 2. pipeline-dlq-consumer ran EVERY MINUTE (1440 invocations/day) against a
--    dead-letter queue that holds a few hundred messages at most — */5 keeps
--    the same drain capacity (limit 50/call) at a fifth of the invocations.
-- 3. pipeline_hygiene_stats(): service-role-only RPC for the nightly
--    pipeline-health GitHub workflow — reports legacy cron jobs, i18n cron
--    residue, and the staging pending_review backlog so regressions fail CI.
-- ============================================================================

DO $$
DECLARE
  v_job text;
BEGIN
  FOR v_job IN
    SELECT jobname FROM cron.job
    WHERE jobname IN (
      'pipeline-venue-validate', 'pipeline-venue-dedup', 'pipeline-venue-commit',
      'pipeline-event-validate', 'pipeline-event-dedup', 'pipeline-event-commit'
    )
    OR jobname LIKE 'translate-i18n-%'
    OR jobname LIKE 'tag\_i18n\_%' ESCAPE '\'
  LOOP
    PERFORM cron.unschedule(v_job);
  END LOOP;
END $$;

-- DLQ consumer: every minute → every 5 minutes (same command, same capacity).
SELECT cron.alter_job(jobid, schedule => '*/5 * * * *')
FROM cron.job WHERE jobname = 'pipeline-dlq-consumer';

-- Hygiene stats for the pipeline-health workflow (scripts/check-pipeline-health.mjs).
CREATE OR REPLACE FUNCTION public.pipeline_hygiene_stats()
RETURNS jsonb
LANGUAGE sql
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
        AND jobname NOT IN ('i18n_cron_auth_fix', 'i18n_translation_dispatch')
    ),
    'staging_pending_review', (
      SELECT count(*) FROM public.ingestion_staging
      WHERE review_status = 'pending_review'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.pipeline_hygiene_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pipeline_hygiene_stats() TO service_role;

COMMENT ON FUNCTION public.pipeline_hygiene_stats() IS
  'Cron/staging hygiene snapshot for the nightly pipeline-health CI check. Service-role only.';
