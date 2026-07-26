-- ============================================================================
-- Ingestion unification P2.4 — recurring venue staging drain
-- ----------------------------------------------------------------------------
-- The admin-triggered venue fetchers (import-foursquare-venues,
-- import-google-places-venues, import-venues-csv) now stage into
-- ingestion_staging with pipeline_run_id = NULL instead of inserting into
-- `venues` directly. The daily venue-ingestion-unified DAG only processes
-- rows scoped to its own pipeline_run_id, and the legacy 5-minute
-- pipeline-venue-* crons were retired by P0 cron hygiene (20260801020000) —
-- so unscoped venue rows need the same hourly drain events (20260704170000)
-- and marketplace (20260703130000) already have.
--
-- Staggered hourly crons walk venue staging through the pipeline WITHOUT a
-- run_id (all stage functions support global selection when run_id is
-- omitted): validate -> dedup -> review-gate -> commit. Normalize is not
-- needed — the import fetchers always write normalized_data.
--
-- Commit runs as direct SQL (commit_venue_staging_batch is advisory-locked +
-- disposition-gated; batch 100/hour keeps the venues INSERT trigger fan-out —
-- geo-link + embeddings + search sync — at a trickle).
--
-- Auth: the proven two-header pattern (see 20260608000000_fix_cron_missing_auth_header).
-- Gateway needs the anon JWT bearer; the internal-gated pipeline-* functions need
-- x-internal-secret = vault internal_invoke_secret. The project's vault has NEITHER
-- SUPABASE_URL nor SUPABASE_SERVICE_ROLE_KEY, so the URL is hardcoded.
-- ============================================================================

DO $$ BEGIN
  PERFORM cron.unschedule(j) FROM unnest(ARRAY[
    'vn-drain-validate','vn-drain-dedup','vn-drain-review','vn-drain-commit'
  ]) j WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = j);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('vn-drain-validate', '9 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-validate',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"entityType":"venue","batch_size":100}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

SELECT cron.schedule('vn-drain-dedup', '24 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-deduplicate',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"entityType":"venue","batch_size":100}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

SELECT cron.schedule('vn-drain-review', '39 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-review-gate',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"entityType":"venue","batch_size":100}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

SELECT cron.schedule('vn-drain-commit', '49 * * * *', $$
  SELECT count(*) FROM public.commit_venue_staging_batch(100);
$$);
