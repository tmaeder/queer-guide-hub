-- Drain the DM push queue every minute → push-dispatcher {"kind":"dm"}.
-- Sends the internal-invoke secret (app gate) + anon bearer (gateway).
DO $$
BEGIN
  PERFORM cron.unschedule('push-dm')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-dm');
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

SELECT cron.schedule(
  'push-dm',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/push-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"kind": "dm"}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $cron$
);
