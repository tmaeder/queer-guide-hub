-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a cron job to automatically fetch news every hour
SELECT cron.schedule(
  'fetch-news-hourly',
  '0 * * * *', -- Every hour at minute 0
  $$
  SELECT
    net.http_post(
        url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/fetch-news',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
        body := '{"automated": true}'::jsonb
    ) as request_id;
  $$
);

-- Create a function to check cron job status
CREATE OR REPLACE FUNCTION public.get_news_cron_status()
RETURNS TABLE(
  jobname text,
  schedule text,
  active boolean,
  jobid bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT 
    j.jobname,
    j.schedule,
    j.active,
    j.jobid
  FROM cron.job j
  WHERE j.jobname = 'fetch-news-hourly';
$$;

-- Grant permissions for cron management to admins
GRANT EXECUTE ON FUNCTION public.get_news_cron_status() TO authenticated;