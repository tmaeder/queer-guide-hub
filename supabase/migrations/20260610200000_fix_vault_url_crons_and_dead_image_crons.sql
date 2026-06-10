-- Cron repair (2026-06-10 dead-code audit, BR-3 + BR-7)
--
-- BR-7: migration 20260610000000 pointed 2 crons (and an earlier change pointed
-- 2 more) at vault secrets 'SUPABASE_URL' / 'SUPABASE_SERVICE_ROLE_KEY' that were
-- NEVER created. net.http_post received url := NULL and failed before reaching the
-- gateway, so all four jobs have been dead since their respective edits:
--   * pipeline-dlq-consumer   (every minute — DLQ not draining)
--   * pipeline-geo-validate   (daily 05:00)
--   * venue-url-checker       (weekly)
--   * marketplace-link-checker (weekly)
-- Fix: hardcode the project URL (house pattern — every other cron does this) and
-- authorize via the EXISTING vault secret 'internal_invoke_secret', which
-- requireInternalOrAdmin() accepts via x-internal-secret. All four functions are
-- verify_jwt=false, so the gateway passes the request without an Authorization
-- header; the anon bearer is included anyway for belt-and-braces gateway safety.
--
-- BR-3: five weekly image crons still invoke per-entity functions that no longer
-- exist anywhere (not deployed, not in repo): fetch-{venue,city,personality,
-- country,village}-images. They 404 on every run. Their replacement is the
-- parameterized fetch-images (entity_type in body, requireAdmin — accepts
-- service-role/internal? NO: requireAdmin only, so cron auth would fail anyway).
-- The admin Backfills tab (BACKFILL_JOBS) is the operative path for image
-- backfills today, and image freshness is also served by event-image-backfill +
-- enrich-logos crons. Decision: UNSCHEDULE the five dead jobs rather than
-- repoint them at an endpoint whose gate they cannot pass.

-- ---------------------------------------------------------------------------
-- BR-7: repair the four vault-NULL crons
-- ---------------------------------------------------------------------------

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'pipeline-dlq-consumer'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-dlq-consumer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"limit":50}'::jsonb
  );
  $cmd$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'pipeline-geo-validate'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-geo-validate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"batch_size":30,"only_new":true}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'venue-url-checker'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/venue-url-checker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"batch_size":200,"stale_days":30}'::jsonb
  );
  $cmd$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'marketplace-link-checker'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-link-checker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"batch_size":200,"stale_days":30}'::jsonb
  );
  $cmd$
);

-- ---------------------------------------------------------------------------
-- BR-3: unschedule the five crons that invoke nonexistent fetch-*-images fns
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'enrich-venue-images',
    'enrich-city-images',
    'enrich-personality-images',
    'enrich-country-images',
    'enrich-village-images'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;
