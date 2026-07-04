-- ============================================================================
-- Recurring events staging drain
-- ----------------------------------------------------------------------------
-- Scraper-side adapters (gaycities weekly sync, legacy outsavvy/patroc runs)
-- publish event rows into ingestion_staging with pipeline_run_id = NULL, but
-- the events-ingestion-bulletproof DAG only processes rows scoped to its own
-- pipeline_run_id — so driver-staged rows never flowed to events. Same gap the
-- marketplace drain closed (20260703130000); this is the events analog.
--
-- Staggered hourly crons walk event staging through the pipeline WITHOUT a
-- run_id (all stage functions support global selection when run_id is omitted):
--   normalize -> validate -> dedup -> review-gate -> commit
-- normalize is included so legacy raw-only rows (outsavvy/patroc, staged
-- without normalized_data) finally drain too; pre-normalized rows (gaycities)
-- skip it via the .is('normalized_data', null) filter.
--
-- Commit runs as direct SQL (commit_event_staging_batch is advisory-locked +
-- disposition-gated; batch 100/hour keeps the events INSERT trigger fan-out —
-- pgmq geo-link + embeddings + search sync — at a trickle).
--
-- Auth: the proven two-header pattern (see 20260608000000_fix_cron_missing_auth_header).
-- Gateway needs the anon JWT bearer; the internal-gated pipeline-* functions need
-- x-internal-secret = vault internal_invoke_secret. The project's vault has NEITHER
-- SUPABASE_URL nor SUPABASE_SERVICE_ROLE_KEY, so the URL is hardcoded.
-- ============================================================================

DO $$ BEGIN
  PERFORM cron.unschedule(j) FROM unnest(ARRAY[
    'ev-drain-normalize','ev-drain-validate','ev-drain-dedup','ev-drain-review','ev-drain-commit'
  ]) j WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = j);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('ev-drain-normalize', '2 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-normalize',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"entityType":"event","batch_size":100}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

SELECT cron.schedule('ev-drain-validate', '7 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-validate',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"entityType":"event","batch_size":100}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

SELECT cron.schedule('ev-drain-dedup', '22 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-deduplicate',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"entityType":"event","batch_size":100}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

SELECT cron.schedule('ev-drain-review', '37 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-review-gate',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"entityType":"event","batch_size":100}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

SELECT cron.schedule('ev-drain-commit', '52 * * * *', $$
  SELECT count(*) FROM public.commit_event_staging_batch(100);
$$);
