-- ============================================================
-- P1: Pipeline dedupe + pause broken jobs + DLQ purge
-- Context: Follow-up to 20260420150000_pipeline_p0_cleanup.sql.
-- Investigation revealed:
--   1. Duplicate hourly news trigger: pg_cron "pipeline-news-ingestion"
--      (5 * * * *) AND workflow "wf-news-pipeline" (0 * * * *) both
--      enqueue the news-ingestion pipeline. CLAUDE.md marks
--      wf-news-pipeline as the canonical hardened path.
--   2. All automation-* workflows fail with "Invalid authorization"
--      on every run (100% failure, filling dead_letter 5+ days).
--      Root cause is service-role auth in workflow-dispatcher →
--      automation function calls; needs infra fix, not SQL.
--   3. pipeline_definitions.schedule is descriptive metadata only
--      (city-ingestion 7 * * * *, country-ingestion 45 3 * * *
--      have no pg_cron entry and thus never fire). Align to truth.
--   4. dead_letter pgmq queue has ~7k messages, oldest 5.7 days.
-- ============================================================

-- 1. Drop duplicate news cron. wf-news-pipeline (0 * * * *) remains.
DO $$
BEGIN
  PERFORM cron.unschedule('pipeline-news-ingestion')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pipeline-news-ingestion');
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 2. Pause automation-* cron triggers that 100%-fail with auth errors.
--    workflow_definitions rows stay is_enabled=true so admins can
--    trigger manually once the dispatcher auth is fixed.
DO $$
DECLARE
  v_job TEXT;
BEGIN
  FOREACH v_job IN ARRAY ARRAY[
    'wf-automation-auto-tagger',
    'wf-automation-content-classifier',
    'wf-automation-content-validator',
    'wf-automation-data-normalizer',
    'wf-automation-dedup-checker',
    'wf-automation-event-validator',
    'wf-automation-geo-enricher',
    'wf-automation-link-sanitizer'
  ] LOOP
    PERFORM cron.unschedule(v_job)
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job);
  END LOOP;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- 3. Align pipeline_definitions.schedule with reality: pipelines with
--    no corresponding pg_cron entry should not advertise a schedule.
UPDATE public.pipeline_definitions
SET schedule = NULL,
    description = COALESCE(description, '') ||
      E'\n[2026-04-20] schedule cleared: no pg_cron trigger exists; ' ||
      'fix credentials (wolfram / csv fileUrl) then re-add cron.',
    updated_at = now()
WHERE name IN ('city-ingestion', 'country-ingestion');

-- 4. Mark marketplace-ingestion pipeline as blocked on config. The
--    wf-marketplace-ingestion cron remains so the moment AWIN_FEED_URL
--    is set in secrets the pipeline will succeed on next 04:00 run.
UPDATE public.pipeline_definitions
SET description = COALESCE(description, '') ||
      E'\n[2026-04-20] BLOCKED: src-awin node errors "AWIN feed URL ' ||
      'not configured" on every run. Set AWIN_FEED_URL in edge ' ||
      'function secrets to unblock.',
    updated_at = now()
WHERE name = 'marketplace-ingestion'
  AND description NOT LIKE '%AWIN_FEED_URL%';

-- 5. Purge dead_letter messages older than 3 days. Recent failures
--    stay so an operator can inspect what broke most recently.
DO $$
DECLARE
  v_purged INT := 0;
  v_msg RECORD;
BEGIN
  FOR v_msg IN
    SELECT msg_id FROM pgmq.q_dead_letter
    WHERE enqueued_at < now() - INTERVAL '3 days'
  LOOP
    PERFORM pgmq.delete('dead_letter', v_msg.msg_id);
    v_purged := v_purged + 1;
  END LOOP;
  RAISE NOTICE 'Purged % dead_letter messages older than 3 days', v_purged;
END $$;
