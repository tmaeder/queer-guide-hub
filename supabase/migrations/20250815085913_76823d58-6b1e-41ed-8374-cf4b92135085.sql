-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a daily cron job to import ILGA data
-- Runs at 2 AM UTC every day to avoid peak hours
SELECT cron.schedule(
  'daily-ilga-import',
  '0 2 * * *', -- At 2:00 AM UTC every day
  $$
  SELECT
    net.http_post(
        url:='https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/import-ilga-data',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
        body:='{"batchSize": 10, "startIndex": 0}'::jsonb
    ) as request_id;
  $$
);

-- Create a function to handle the full import in batches
CREATE OR REPLACE FUNCTION public.run_daily_ilga_import()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  batch_size INTEGER := 10;
  current_index INTEGER := 0;
  total_countries INTEGER := 195; -- Approximate number of countries
  max_iterations INTEGER := 25; -- Safety limit
  iteration_count INTEGER := 0;
BEGIN
  -- Log the start of the import process
  INSERT INTO public.cron_job_logs (job_name, status, message, created_at)
  VALUES ('daily-ilga-import', 'started', 'Beginning daily ILGA data import', now());
  
  -- Process all countries in batches
  WHILE current_index < total_countries AND iteration_count < max_iterations LOOP
    -- Make HTTP request to import-ilga-data function
    PERFORM net.http_post(
      url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/import-ilga-data',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8"}'::jsonb,
      body := format('{"batchSize": %s, "startIndex": %s}', batch_size, current_index)::jsonb
    );
    
    -- Wait between batches to avoid overwhelming the ILGA server
    PERFORM pg_sleep(5);
    
    -- Move to next batch
    current_index := current_index + batch_size;
    iteration_count := iteration_count + 1;
  END LOOP;
  
  -- Log completion
  INSERT INTO public.cron_job_logs (job_name, status, message, created_at)
  VALUES ('daily-ilga-import', 'completed', format('Completed ILGA import with %s iterations', iteration_count), now());
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log any errors
    INSERT INTO public.cron_job_logs (job_name, status, message, error_details, created_at)
    VALUES ('daily-ilga-import', 'error', 'Error during ILGA import', SQLERRM, now());
    RAISE;
END;
$$;

-- Create a table to log cron job execution
CREATE TABLE IF NOT EXISTS public.cron_job_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name text NOT NULL,
  status text NOT NULL,
  message text,
  error_details text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on cron job logs
ALTER TABLE public.cron_job_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for admins to view cron job logs
CREATE POLICY "Admins can view cron job logs" ON public.cron_job_logs
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Update the cron job to use the new function
SELECT cron.unschedule('daily-ilga-import');

SELECT cron.schedule(
  'daily-ilga-import',
  '0 2 * * *', -- At 2:00 AM UTC every day
  'SELECT public.run_daily_ilga_import();'
);