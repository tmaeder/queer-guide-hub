-- ============================================================================
-- Recurring marketplace staging drain
-- ----------------------------------------------------------------------------
-- The registry-driven driver (marketplace-sync-merchants, 20260703120000) stages
-- fresh vendor data hourly, but nothing drained the GLOBAL marketplace staging
-- backlog to live listings: the daily marketplace-ingestion DAG only processes
-- rows scoped to its own pipeline_run_id, so driver-staged rows (null run_id) +
-- a large legacy approved-but-unclassified backlog never committed.
--
-- These staggered hourly crons walk marketplace staging through the pipeline
-- WITHOUT a run_id (all stages + commit_marketplace_staging_batch already support
-- global selection when run_id is omitted):
--   validate -> relevance (newest + backlog) -> dedup -> quality -> review -> commit
-- A newly-synced product staged at :00 is live within the hour; the commit tick
-- also closes the refresh loop (re-opened changed rows are pre-gated -> price /
-- stock update + price_history). marketplace-relevance's `order:newest` tick keeps
-- fresh vendor products ahead of the legacy backlog (both share its 800/day LLM
-- cap); the `order:oldest` tick grinds the backlog on leftover budget.
--
-- Auth: the proven two-header pattern (see 20260608000000_fix_cron_missing_auth_header).
-- Gateway needs the anon JWT bearer; the internal-gated pipeline-* functions need
-- x-internal-secret = vault internal_invoke_secret. The project's vault has NEITHER
-- SUPABASE_URL nor SUPABASE_SERVICE_ROLE_KEY, so the URL is hardcoded.
-- ============================================================================

DO $$ BEGIN
  PERFORM cron.unschedule(j) FROM unnest(ARRAY[
    'mp-drain-validate','mp-drain-relevance-fresh','mp-drain-relevance-backlog',
    'mp-drain-dedup','mp-drain-quality','mp-drain-review','mp-drain-commit'
  ]) j WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = j);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Anon JWT (gateway) + internal secret (function gate). Kept inline per repo convention.
SELECT cron.schedule('mp-drain-validate', '5 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-validate',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"entityType":"marketplace","batch_size":100}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

SELECT cron.schedule('mp-drain-relevance-fresh', '10 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-relevance',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"order":"newest","daily_cap":800,"batch_size":40}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('mp-drain-relevance-backlog', '40 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-relevance',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"order":"oldest","daily_cap":800,"batch_size":40}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('mp-drain-dedup', '25 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-deduplicate',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"entityType":"marketplace","batch_size":100}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

SELECT cron.schedule('mp-drain-quality', '30 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-quality-score',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"entityType":"marketplace","batch_size":100}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

SELECT cron.schedule('mp-drain-review', '35 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-review-gate',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"entityType":"marketplace","batch_size":100}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

SELECT cron.schedule('mp-drain-commit', '45 * * * *', $$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-commit',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"targetTable":"marketplace_listings","batch_size":200}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);
