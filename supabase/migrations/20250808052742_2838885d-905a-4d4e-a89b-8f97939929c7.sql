-- Performance optimization migration
-- Add indexes for frequently queried columns

-- Venues table indexes
CREATE INDEX IF NOT EXISTS idx_venues_city_btree ON public.venues USING btree (city);
CREATE INDEX IF NOT EXISTS idx_venues_category_btree ON public.venues USING btree (category);
CREATE INDEX IF NOT EXISTS idx_venues_featured_created ON public.venues (featured DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venues_location ON public.venues (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venues_tags_gin ON public.venues USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_venues_amenities_gin ON public.venues USING gin (amenities);
CREATE INDEX IF NOT EXISTS idx_venues_services_gin ON public.venues USING gin (services);
CREATE INDEX IF NOT EXISTS idx_venues_accessibility_gin ON public.venues USING gin (accessibility_attributes);
CREATE INDEX IF NOT EXISTS idx_venues_target_groups_gin ON public.venues USING gin (target_groups);
CREATE INDEX IF NOT EXISTS idx_venues_search ON public.venues USING gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(address, '')));

-- Events table indexes
CREATE INDEX IF NOT EXISTS idx_events_city_btree ON public.events USING btree (city);
CREATE INDEX IF NOT EXISTS idx_events_status_start_date ON public.events (status, start_date);
CREATE INDEX IF NOT EXISTS idx_events_featured_start ON public.events (featured DESC, start_date ASC);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON public.events USING btree (event_type);
CREATE INDEX IF NOT EXISTS idx_events_location ON public.events (latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_tags_gin ON public.events USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_events_accessibility_gin ON public.events USING gin (accessibility_attributes);
CREATE INDEX IF NOT EXISTS idx_events_target_groups_gin ON public.events USING gin (target_groups);
CREATE INDEX IF NOT EXISTS idx_events_search ON public.events USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

-- User and profile indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON public.profiles USING btree (display_name);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON public.profiles USING btree (city);

-- Event attendees indexes
CREATE INDEX IF NOT EXISTS idx_event_attendees_event_user ON public.event_attendees (event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user_status ON public.event_attendees (user_id, status);

-- Favorites indexes
CREATE INDEX IF NOT EXISTS idx_event_favorites_user ON public.event_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_venue_favorites_user ON public.venue_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_city_favorites_user ON public.city_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_country_favorites_user ON public.country_favorites (user_id);

-- Stats optimization - create materialized view for dashboard stats
CREATE MATERIALIZED VIEW IF NOT EXISTS public.dashboard_stats AS
SELECT 
  (SELECT COUNT(*) FROM public.venues) as venues_count,
  (SELECT COUNT(*) FROM public.profiles) as members_count,
  (SELECT COUNT(*) FROM public.cities) as cities_count,
  (SELECT COUNT(*) FROM public.events WHERE status = 'active' AND start_date >= NOW() AND start_date <= NOW() + INTERVAL '7 days') as weekly_events_count,
  NOW() as last_updated;

-- Function to refresh dashboard stats
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

-- Create a trigger to refresh stats periodically (every hour)
-- This will be called by a cron job or edge function
CREATE OR REPLACE FUNCTION public.update_dashboard_stats_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Only refresh if last update was more than 1 hour ago
  IF (SELECT last_updated FROM public.dashboard_stats) < NOW() - INTERVAL '1 hour' THEN
    PERFORM public.refresh_dashboard_stats();
  END IF;
  RETURN NULL;
END;
$$;

-- Optimized function for nearby venues/events using PostGIS-style calculations
CREATE OR REPLACE FUNCTION public.get_nearby_venues(
  user_lat DECIMAL,
  user_lng DECIMAL,
  radius_km INTEGER DEFAULT 50,
  max_results INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  category TEXT,
  city TEXT,
  address TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  distance_km DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id,
    v.name,
    v.category,
    v.city,
    v.address,
    v.latitude,
    v.longitude,
    ROUND(
      (6371 * acos(
        cos(radians(user_lat)) * 
        cos(radians(v.latitude)) * 
        cos(radians(v.longitude) - radians(user_lng)) + 
        sin(radians(user_lat)) * 
        sin(radians(v.latitude))
      ))::numeric, 2
    ) AS distance_km
  FROM public.venues v
  WHERE 
    v.latitude IS NOT NULL 
    AND v.longitude IS NOT NULL
    AND (6371 * acos(
      cos(radians(user_lat)) * 
      cos(radians(v.latitude)) * 
      cos(radians(v.longitude) - radians(user_lng)) + 
      sin(radians(user_lat)) * 
      sin(radians(v.latitude))
    )) <= radius_km
  ORDER BY distance_km
  LIMIT max_results;
END;
$$;

-- Similar function for events
CREATE OR REPLACE FUNCTION public.get_nearby_events(
  user_lat DECIMAL,
  user_lng DECIMAL,
  radius_km INTEGER DEFAULT 50,
  max_results INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  event_type TEXT,
  city TEXT,
  start_date TIMESTAMPTZ,
  latitude DECIMAL,
  longitude DECIMAL,
  distance_km DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.title,
    e.event_type,
    e.city,
    e.start_date,
    e.latitude,
    e.longitude,
    ROUND(
      (6371 * acos(
        cos(radians(user_lat)) * 
        cos(radians(e.latitude)) * 
        cos(radians(e.longitude) - radians(user_lng)) + 
        sin(radians(user_lat)) * 
        sin(radians(e.latitude))
      ))::numeric, 2
    ) AS distance_km
  FROM public.events e
  WHERE 
    e.latitude IS NOT NULL 
    AND e.longitude IS NOT NULL
    AND e.status = 'active'
    AND e.start_date >= NOW()
    AND (6371 * acos(
      cos(radians(user_lat)) * 
      cos(radians(e.latitude)) * 
      cos(radians(e.longitude) - radians(user_lng)) + 
      sin(radians(user_lat)) * 
      sin(radians(e.latitude))
    )) <= radius_km
  ORDER BY distance_km, e.start_date
  LIMIT max_results;
END;
$$;