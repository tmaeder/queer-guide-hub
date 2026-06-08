-- Fix pg_cron jobs whose net.http_post calls target verify_jwt=true edge functions
-- but send no gateway-accepted auth header (no Authorization, no apikey). The Supabase
-- API gateway rejects them with 401 {"code":"UNAUTHORIZED_NO_AUTH_HEADER"} BEFORE the
-- function runs, so the crons silently do nothing.
--
-- Empirically verified (2026-06-08) the ONLY two jobs currently gateway-blocked are:
--   * news_link_checker      -> news-link-checker   (verify_jwt=true, sends only x-internal-secret)
--   * classify-new-content   -> backfill-llm-enrich (verify_jwt=true, sends only x-webhook-secret)
--
-- The ~11 other no-Authorization cron jobs (event_*/city_*/tag_*/etc.) target
-- verify_jwt=false functions: the gateway passes them through and they authorize via
-- their X-Webhook-Secret, so they are NOT affected and are left untouched.
-- refresh-watched-urls is now verify_jwt=false and returns 200, also left untouched.
--
-- Fix: add the public anon JWT as 'Authorization','Bearer <anon>'. A valid anon JWT
-- passes the gateway regardless of verify_jwt; the function's own internal-secret auth
-- (x-internal-secret / x-webhook-secret, unchanged) still applies. Same pattern as the
-- translate-i18n cron fix.

-- news_link_checker -> news-link-checker
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'news_link_checker'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/news-link-checker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"batch_limit": 80}'::jsonb
  );
  $cmd$
);

-- classify-new-content -> backfill-llm-enrich
-- NOTE: also fixes a second latent bug — the old command derived the URL from a vault
-- secret 'SUPABASE_URL' that does not exist, so net.http_post got a NULL url and failed
-- with a not-null constraint violation BEFORE ever reaching the gateway. URL now hardcoded
-- like every other cron job.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'classify-new-content'),
  command := $cmd$
    SELECT
      net.http_post(
        url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-llm-enrich',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
          'x-webhook-secret', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'WEBHOOK_SECRET'), 'meilisearch-sync-webhook-2026')
        ),
        body := jsonb_build_object('target', t, 'batch_size', 40)
      )
    FROM unnest(ARRAY['venues','events','personalities','marketplace']) AS t
  $cmd$
);
