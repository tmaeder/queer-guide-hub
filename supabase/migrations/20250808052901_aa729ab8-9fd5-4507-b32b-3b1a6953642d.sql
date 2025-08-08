-- Basic performance indexes
CREATE INDEX IF NOT EXISTS idx_venues_city ON public.venues (city);
CREATE INDEX IF NOT EXISTS idx_venues_category ON public.venues (category);
CREATE INDEX IF NOT EXISTS idx_venues_featured_created ON public.venues (featured DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_city ON public.events (city);
CREATE INDEX IF NOT EXISTS idx_events_status_start ON public.events (status, start_date);
CREATE INDEX IF NOT EXISTS idx_events_featured_start ON public.events (featured DESC, start_date ASC);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles (user_id);

-- Materialized view for dashboard stats
CREATE MATERIALIZED VIEW IF NOT EXISTS public.dashboard_stats AS
SELECT 
  (SELECT COUNT(*) FROM public.venues) as venues_count,
  (SELECT COUNT(*) FROM public.profiles) as members_count,
  (SELECT COUNT(*) FROM public.cities) as cities_count,
  (SELECT COUNT(*) FROM public.events WHERE status = 'active' AND start_date >= NOW() AND start_date <= NOW() + INTERVAL '7 days') as weekly_events_count,
  NOW() as last_updated;

-- Function to refresh stats
CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.dashboard_stats;
END;
$$;