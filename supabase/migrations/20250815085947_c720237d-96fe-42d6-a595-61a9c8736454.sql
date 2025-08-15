-- Fix the function search path security issue
CREATE OR REPLACE FUNCTION public.run_daily_ilga_import()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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