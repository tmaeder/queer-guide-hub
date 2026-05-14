-- Fix the remaining security definer function
-- The dashboard_stats materialized view might be causing the security definer issue
-- Let's check and fix it

-- Drop and recreate the refresh function without security definer if it exists
DROP FUNCTION IF EXISTS public.refresh_dashboard_stats();

-- Create a simple refresh function without security definer
CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Only refresh if the materialized view exists
  IF EXISTS (
    SELECT 1 FROM pg_matviews 
    WHERE schemaname = 'public' 
    AND matviewname = 'dashboard_stats'
  ) THEN
    REFRESH MATERIALIZED VIEW public.dashboard_stats;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users only
REVOKE ALL ON FUNCTION public.refresh_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_stats() TO authenticated;