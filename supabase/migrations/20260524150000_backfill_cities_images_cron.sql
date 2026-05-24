-- Daily cron for backfill-cities-images. Calls the edge function at
-- 04:45 UTC (after the existing 04:30 geo-validate cron). Bounded to 50
-- cities per run; with ~500 cities missing image_url the catalog fills
-- in ~10 days. Once complete the function returns
-- {message:"nothing to backfill"} and is a cheap no-op.
--
-- Mirrors the pg_cron + net.http_post pattern from
-- 20260426130000_geo_validate_cron.sql. Uses the project anon JWT —
-- the function intentionally accepts anon to enable this; abuse is
-- bounded by Pexels' own rate limit and the image_flagged auto-throttle.

DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='backfill-cities-images';
  PERFORM cron.schedule(
    'backfill-cities-images',
    '45 4 * * *',
    $f$
    SELECT net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/backfill-cities-images',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
      body := '{"batch_size":50}'::jsonb,
      timeout_milliseconds := 120000
    );
    $f$
  );
END $$;
