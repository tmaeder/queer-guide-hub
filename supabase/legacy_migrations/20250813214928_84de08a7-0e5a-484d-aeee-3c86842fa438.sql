-- Fix security definer view issue
-- Remove security barrier property from view to fix security linter warning

-- Recreate the view without security barrier
DROP VIEW IF EXISTS public.venue_checkin_stats;

CREATE VIEW public.venue_checkin_stats AS
SELECT 
  venue_id,
  COUNT(*) as total_checkins,
  DATE_TRUNC('hour', checked_in_at) as checkin_hour
FROM public.venue_checkins
WHERE created_at >= (NOW() - INTERVAL '30 days')
GROUP BY venue_id, DATE_TRUNC('hour', checked_in_at);

-- Grant access to the anonymized view
GRANT SELECT ON public.venue_checkin_stats TO authenticated;