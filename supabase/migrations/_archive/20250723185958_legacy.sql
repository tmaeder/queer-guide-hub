-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a comprehensive Algolia sync cron job that runs every 6 hours
SELECT cron.schedule(
  'algolia-comprehensive-sync',
  '0 */6 * * *', -- Every 6 hours
  $$
  SELECT
    net.http_post(
        url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/sync-all-to-algolia',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjQzOTUwNCwiZXhwIjoyMDY4MDE1NTA0fQ.Mf3kP8hGv8WLZJ_w2pKBGo5WZqItFnYXMb39jdmZtSw"}'::jsonb,
        body:='{"tables": "all", "scheduled": true}'::jsonb
    ) as request_id;
  $$
);

-- Create a faster sync job for tags only that runs every hour
SELECT cron.schedule(
  'algolia-tags-sync',
  '0 * * * *', -- Every hour
  $$
  SELECT
    net.http_post(
        url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/sync-tags-to-algolia',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjQzOTUwNCwiZXhwIjoyMDY4MDE1NTA0fQ.Mf3kP8hGv8WLZJ_w2pKBGo5WZqItFnYXMb39jdmZtSw"}'::jsonb,
        body:='{"action": "sync_all", "scheduled": true}'::jsonb
    ) as request_id;
  $$
);

-- Create a function to check cron job status
CREATE OR REPLACE FUNCTION get_algolia_sync_status()
RETURNS TABLE (
  jobname text,
  schedule text,
  active boolean,
  last_run timestamptz,
  next_run timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT 
    jobname,
    schedule,
    active,
    last_run,
    next_run
  FROM cron.job 
  WHERE jobname LIKE 'algolia-%'
  ORDER BY jobname;
$$;

-- Add helpful comments
COMMENT ON FUNCTION get_algolia_sync_status() IS 'Returns status of Algolia synchronization cron jobs';

-- Create indexes for better search performance on commonly searched fields
CREATE INDEX IF NOT EXISTS idx_venues_search ON public.venues USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS idx_events_search ON public.events USING GIN(to_tsvector('english', title || ' ' || COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS idx_marketplace_search ON public.marketplace_listings USING GIN(to_tsvector('english', title || ' ' || COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS idx_community_posts_search ON public.community_posts USING GIN(to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_countries_search ON public.countries USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS idx_cities_search ON public.cities USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));