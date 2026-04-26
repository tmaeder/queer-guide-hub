-- Daily geo-validation cron. Calls pipeline-geo-validate at 05:00 UTC.
-- Batch size 30 → ~33s; well under edge timeout. only_new=true so it
-- only revalidates venues touched in the last 24h.
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='pipeline-geo-validate';
  PERFORM cron.schedule(
    'pipeline-geo-validate',
    '0 5 * * *',
    $f$
    SELECT net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-geo-validate',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
      body := '{"batch_size":30,"only_new":true}'::jsonb,
      timeout_milliseconds := 60000
    );
    $f$
  );
END $$;
