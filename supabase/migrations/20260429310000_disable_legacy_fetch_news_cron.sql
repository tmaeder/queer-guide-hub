-- Disable the legacy fetch-news cron so news-ingestion runs only via the
-- canonical wf-news-pipeline → news-ingestion DAG path.
--
-- Background:
--   * fetch-news-every-2-hours cron (migration 20250805172222) POSTs to the
--     fetch-news edge function which writes directly to news_articles via
--     supabase/functions/fetch-news/index.ts:595-609. Bypasses validation,
--     dedup, and review gates.
--   * fetch-news workflow_definitions row (migration 20260224193500) is
--     also enabled with is_enabled=true and a hourly schedule, so the
--     workflow-dispatcher cron triggers fetch-news a second way.
--   * The canonical hardened path is wf-news-pipeline → workflow-dispatcher
--     → news-ingestion DAG (10 nodes including sanitize / quality_enhance,
--     last rewired in migration 20260427210500). The DAG ends in
--     pipeline-commit using the news_commit_staging_batch RPC with full
--     dedup audit, fingerprint UNIQUE, and review gating.
--
-- This migration:
--   1. Sanity-checks that wf-news-pipeline is enabled before touching the
--      legacy paths. If it's not, RAISES NOTICE and aborts so news
--      ingestion isn't accidentally taken offline.
--   2. Unschedules fetch-news-every-2-hours.
--   3. Disables the fetch-news workflow_definitions row.
--
-- The fetch-news edge function itself is NOT removed — admins still trigger
-- it manually from NewsSourcesManager.tsx when they want to re-fetch from a
-- specific source. Only the automated duplicate triggers are stopped.
--
-- Recovery: if news ingestion drops after this migration, the operator can:
--   1. UPDATE workflow_definitions SET is_enabled=true WHERE name='fetch-news';
--   2. SELECT cron.schedule('fetch-news-every-2-hours', '0 */2 * * *',
--        $$SELECT net.http_post(...)$$);
--      (See migration 20250805172222 for the full schedule body.)

DO $$
DECLARE
  v_canonical_enabled boolean;
  v_canonical_count   int;
BEGIN
  -- 1. Sanity check: confirm the canonical path is enabled before disabling
  --    the legacy ones. workflow_definitions.is_enabled is the safer gate
  --    (workflow-dispatcher polls this); cron.job is the harder one to
  --    inspect portably.
  SELECT count(*), bool_or(is_enabled)
    INTO v_canonical_count, v_canonical_enabled
    FROM public.workflow_definitions
   WHERE name IN ('wf-news-pipeline', 'news-ingestion');

  IF v_canonical_count = 0 THEN
    RAISE EXCEPTION 'fetch-news cutover aborted: no wf-news-pipeline / news-ingestion workflow_definitions row found. The canonical pipeline is not registered; disabling the legacy path would break news ingestion.';
  END IF;

  IF NOT v_canonical_enabled THEN
    RAISE EXCEPTION 'fetch-news cutover aborted: canonical wf-news-pipeline / news-ingestion is registered but is_enabled=false. Enable it first (and verify it actually runs) before disabling the legacy path.';
  END IF;

  -- 2. Unschedule the legacy cron. cron.unschedule errors if the job
  --    doesn't exist; the WHERE EXISTS makes this idempotent for replay
  --    on staging environments where the cron may not have been seeded.
  PERFORM cron.unschedule('fetch-news-every-2-hours')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-news-every-2-hours');

  -- 3. Disable the workflow_definitions row so workflow-dispatcher stops
  --    invoking fetch-news. We don't DELETE the row — the function still
  --    exists for manual admin triggers, and a future re-enable is just a
  --    flag flip rather than re-seeding.
  UPDATE public.workflow_definitions
     SET is_enabled = false,
         updated_at = now()
   WHERE name = 'fetch-news'
     AND is_enabled = true;

EXCEPTION
  -- cron extension may not be installed on every environment (e.g. local
  -- dev). Don't break those replays — the workflow_definitions update is
  -- the more important gate.
  WHEN undefined_function THEN
    UPDATE public.workflow_definitions
       SET is_enabled = false,
           updated_at = now()
     WHERE name = 'fetch-news'
       AND is_enabled = true;
END $$;
