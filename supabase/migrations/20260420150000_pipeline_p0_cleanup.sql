-- ============================================================
-- P0 cleanup: disable template pipelines + stuck-run watchdog
-- Context: dashboard shows 7 "Template" pipelines scheduled and
-- failing, plus pipeline_runs stuck in 'running' for days with
-- no timeout enforcement. Templates should not run.
-- ============================================================

-- 1. Disable scheduled execution of all template pipelines.
UPDATE public.pipeline_definitions
SET is_enabled = false, updated_at = now()
WHERE is_template = true
  AND is_enabled = true;

-- 2. Fail any currently-stuck runs so dashboard reflects reality.
UPDATE public.pipeline_runs
SET status = 'failed',
    error_message = COALESCE(error_message, 'reaped: exceeded timeout_seconds or stuck > 1h'),
    completed_at = now()
WHERE status = 'running'
  AND started_at IS NOT NULL
  AND started_at < now() - INTERVAL '1 hour';

-- 3. Watchdog: reap stuck runs using each pipeline's own timeout_seconds
--    (falls back to 1h). Safe to call repeatedly and from cron.
CREATE OR REPLACE FUNCTION public.reap_stuck_pipeline_runs()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH reaped AS (
    UPDATE public.pipeline_runs r
    SET status = 'failed',
        error_message = COALESCE(
          r.error_message,
          format('reaped: running > %s s without heartbeat',
                 COALESCE(d.timeout_seconds, 3600))
        ),
        completed_at = now()
    FROM public.pipeline_definitions d
    WHERE r.pipeline_id = d.id
      AND r.status = 'running'
      AND r.started_at IS NOT NULL
      AND r.started_at < now()
          - make_interval(secs => COALESCE(d.timeout_seconds, 3600))
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM reaped;

  -- Runs whose pipeline_id got nulled out: fall back to 1h.
  WITH reaped AS (
    UPDATE public.pipeline_runs
    SET status = 'failed',
        error_message = COALESCE(error_message, 'reaped: orphan run running > 1h'),
        completed_at = now()
    WHERE status = 'running'
      AND pipeline_id IS NULL
      AND started_at IS NOT NULL
      AND started_at < now() - INTERVAL '1 hour'
    RETURNING 1
  )
  SELECT v_count + count(*) INTO v_count FROM reaped;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reap_stuck_pipeline_runs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reap_stuck_pipeline_runs() TO service_role;

-- 4. Schedule watchdog every 5 minutes via pg_cron (idempotent re-run).
DO $$
BEGIN
  PERFORM cron.unschedule('reap-stuck-pipeline-runs')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'reap-stuck-pipeline-runs'
  );
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;

SELECT cron.schedule(
  'reap-stuck-pipeline-runs',
  '*/5 * * * *',
  $cron$SELECT public.reap_stuck_pipeline_runs();$cron$
);
