-- The marketplace-image-mirror function now requires requireInternalOrAdmin
-- (internal-secret / service-role / admin). The dedicated */5 cron previously
-- sent ONLY the anon bearer, so it would start getting 401'd. Reschedule it
-- (same job name = replace) to also send x-internal-secret from Vault, matching
-- the established two-header cron convention. The workflow-dispatcher DAG caller
-- already forwards X-Internal-Secret + service-role, so it needs no change.
select cron.schedule('marketplace_image_mirror', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/marketplace-image-mirror',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='internal_invoke_secret')
    ),
    body := '{"limit":40}'::jsonb,
    timeout_milliseconds := 55000
  );
$cron$);
