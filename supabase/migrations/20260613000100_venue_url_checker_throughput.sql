-- Venue data-quality remediation — Phase 0 (2026-06-13)
--
-- venue-url-checker only ever checked 1,950 / 34,150 venues (94% never checked):
-- it ran once daily at batch 200 (≈160 days to cover the catalog), and earlier
-- failed outright on a vault-NULL auth bug (repaired 20260610200000). The auth is
-- fixed and the function now probes 25-wide in parallel at batch 500, so raise the
-- cadence to every 20 minutes until the backlog clears. The function self-throttles
-- once caught up: the 30-day stale window means steady-state volume is small and
-- empty runs return immediately. Re-check stays at 30 days.
--
-- Pattern mirrors 20260610200000: hardcoded project URL + anon bearer (gateway
-- belt-and-braces) + x-internal-secret from the existing vault secret.

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'venue-url-checker'),
  schedule := '*/20 * * * *',
  command  := $cmd$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/venue-url-checker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"batch_size":500,"stale_days":30}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cmd$
);
