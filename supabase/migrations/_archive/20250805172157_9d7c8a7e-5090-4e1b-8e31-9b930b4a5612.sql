-- Set up automatic news import cron job
-- First, enable required extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing news import cron jobs
SELECT cron.unschedule('fetch-news-hourly');
SELECT cron.unschedule('fetch-news-daily');

-- Create a new cron job to fetch news every 2 hours
SELECT cron.schedule(
  'fetch-news-every-2-hours',
  '0 */2 * * *', -- Every 2 hours at minute 0
  $$
  SELECT
    net.http_post(
        url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/fetch-news',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
        body:='{"cron_trigger": true}'::jsonb
    ) as request_id;
  $$
);

-- Verify the cron job was created
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'fetch-news-every-2-hours';