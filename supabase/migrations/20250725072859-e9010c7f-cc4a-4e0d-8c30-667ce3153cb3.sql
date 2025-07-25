-- Performance Optimization Migration
-- Add composite indexes for commonly queried combinations

-- Events table optimizations
DROP INDEX IF EXISTS idx_events_category;
CREATE INDEX idx_events_status_start_date ON public.events(status, start_date) WHERE status = 'active';
CREATE INDEX idx_events_city_category ON public.events(city, event_category) WHERE status = 'active';
CREATE INDEX idx_events_featured_start ON public.events(featured DESC, start_date ASC) WHERE status = 'active';
CREATE INDEX idx_events_location_active ON public.events(latitude, longitude) WHERE status = 'active' AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- Venues table optimizations  
CREATE INDEX IF NOT EXISTS idx_venues_city_country ON public.venues(city, country);
CREATE INDEX IF NOT EXISTS idx_venues_location ON public.venues(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venues_verification ON public.venues(verification_status) WHERE verification_status IS NOT NULL;

-- Profiles table optimizations
CREATE INDEX IF NOT EXISTS idx_profiles_verification_mode ON public.profiles(verification_status, current_mode);
CREATE INDEX IF NOT EXISTS idx_profiles_location ON public.profiles(location) WHERE location IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_updated ON public.profiles(updated_at DESC);

-- News articles optimizations
CREATE INDEX IF NOT EXISTS idx_news_published_category ON public.news_articles(published_at DESC, category) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_news_city_published ON public.news_articles(city_id, published_at DESC) WHERE city_id IS NOT NULL;

-- Community posts optimizations
CREATE INDEX IF NOT EXISTS idx_community_posts_visibility_created ON public.community_posts(visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_user_created ON public.community_posts(user_id, created_at DESC);

-- User connections optimizations
CREATE INDEX IF NOT EXISTS idx_user_connections_status_type ON public.user_connections(status, type);

-- Aid requests/offers optimizations for the new mutual aid features
CREATE INDEX IF NOT EXISTS idx_aid_requests_status_urgency ON public.aid_requests(status, urgency) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_aid_requests_city_type ON public.aid_requests(city_id, request_type) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_aid_requests_visibility_created ON public.aid_requests(visibility, created_at DESC) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_aid_offers_status_availability ON public.aid_offers(status, availability) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS idx_aid_offers_city_type ON public.aid_offers(city_id, offer_type) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS idx_aid_offers_visibility_created ON public.aid_offers(visibility, created_at DESC) WHERE status = 'available';

-- Request responses optimizations
CREATE INDEX IF NOT EXISTS idx_request_responses_status_created ON public.request_responses(response_status, created_at DESC);

-- Community reviews optimizations
CREATE INDEX IF NOT EXISTS idx_community_reviews_rating_created ON public.community_reviews(rating, created_at DESC);

-- User skills optimizations
CREATE INDEX IF NOT EXISTS idx_user_skills_offering ON public.user_skills(is_offering, proficiency_level) WHERE is_offering = true;
CREATE INDEX IF NOT EXISTS idx_user_skills_category ON public.user_skills(skill_id) 
  JOIN public.skills ON skills.id = user_skills.skill_id WHERE skills.category IS NOT NULL;

-- Marketplace optimizations
CREATE INDEX IF NOT EXISTS idx_marketplace_status_created ON public.marketplace_listings(status, created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_marketplace_category_price ON public.marketplace_listings(category_id, price) WHERE status = 'active';

-- Add materialized view for directory performance
CREATE MATERIALIZED VIEW IF NOT EXISTS public.directory_stats AS
SELECT 
  'venues' as entity_type,
  country,
  city,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE verification_status = 'verified') as verified_count,
  AVG(rating) as avg_rating
FROM public.venues 
WHERE status = 'active'
GROUP BY country, city

UNION ALL

SELECT 
  'events' as entity_type,
  country,
  city,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE featured = true) as verified_count,
  NULL as avg_rating
FROM public.events 
WHERE status = 'active' AND start_date >= NOW()
GROUP BY country, city

UNION ALL

SELECT 
  'aid_requests' as entity_type,
  'Global' as country,
  c.name as city,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE ar.urgency = 'high') as verified_count,
  NULL as avg_rating
FROM public.aid_requests ar
LEFT JOIN public.cities c ON ar.city_id = c.id
WHERE ar.status = 'open'
GROUP BY c.name;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_directory_stats_entity_location ON public.directory_stats(entity_type, country, city);

-- Function to refresh directory stats
CREATE OR REPLACE FUNCTION public.refresh_directory_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.directory_stats;
END;
$$;

-- Create function for efficient venue search with filters
CREATE OR REPLACE FUNCTION public.search_venues_optimized(
  p_country TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_venue_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  venue_type TEXT,
  rating NUMERIC,
  verification_status TEXT,
  latitude NUMERIC,
  longitude NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id,
    v.name,
    v.address,
    v.city,
    v.country,
    v.venue_type,
    v.rating,
    v.verification_status,
    v.latitude,
    v.longitude
  FROM public.venues v
  WHERE v.status = 'active'
    AND (p_country IS NULL OR v.country ILIKE p_country)
    AND (p_city IS NULL OR v.city ILIKE p_city)
    AND (p_venue_type IS NULL OR v.venue_type = p_venue_type)
  ORDER BY 
    v.verification_status DESC,
    v.rating DESC NULLS LAST,
    v.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Create function for efficient events search
CREATE OR REPLACE FUNCTION public.search_events_optimized(
  p_country TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_event_category TEXT DEFAULT NULL,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  city TEXT,
  country TEXT,
  event_category TEXT,
  featured BOOLEAN,
  venue_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.title,
    e.description,
    e.start_date,
    e.end_date,
    e.city,
    e.country,
    e.event_category,
    e.featured,
    e.venue_name
  FROM public.events e
  WHERE e.status = 'active'
    AND e.start_date >= COALESCE(p_start_date, NOW())
    AND (p_country IS NULL OR e.country ILIKE p_country)
    AND (p_city IS NULL OR e.city ILIKE p_city)
    AND (p_event_category IS NULL OR e.event_category = p_event_category)
  ORDER BY 
    e.featured DESC,
    e.start_date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Create function for aid requests/offers search
CREATE OR REPLACE FUNCTION public.search_aid_requests_optimized(
  p_city_id UUID DEFAULT NULL,
  p_request_type TEXT DEFAULT NULL,
  p_urgency TEXT DEFAULT NULL,
  p_visibility TEXT DEFAULT 'public',
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  request_type TEXT,
  urgency TEXT,
  location_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  tags TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ar.id,
    ar.title,
    ar.description,
    ar.request_type,
    ar.urgency,
    ar.location_text,
    ar.created_at,
    ar.tags
  FROM public.aid_requests ar
  WHERE ar.status = 'open'
    AND ar.visibility = p_visibility
    AND (p_city_id IS NULL OR ar.city_id = p_city_id)
    AND (p_request_type IS NULL OR ar.request_type = p_request_type)
    AND (p_urgency IS NULL OR ar.urgency = p_urgency)
  ORDER BY 
    CASE ar.urgency 
      WHEN 'emergency' THEN 1
      WHEN 'high' THEN 2  
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END,
    ar.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Add partial indexes for better performance on filtered queries
CREATE INDEX IF NOT EXISTS idx_events_active_future ON public.events(start_date, featured) 
  WHERE status = 'active' AND start_date >= NOW();

CREATE INDEX IF NOT EXISTS idx_venues_active_verified ON public.venues(rating DESC, created_at DESC) 
  WHERE status = 'active' AND verification_status = 'verified';

CREATE INDEX IF NOT EXISTS idx_aid_urgent_open ON public.aid_requests(created_at DESC) 
  WHERE status = 'open' AND urgency IN ('emergency', 'high');

-- Optimize text search with GIN indexes for tags
CREATE INDEX IF NOT EXISTS idx_events_tags_gin ON public.events USING GIN(target_groups) 
  WHERE target_groups IS NOT NULL AND array_length(target_groups, 1) > 0;

CREATE INDEX IF NOT EXISTS idx_aid_requests_tags_gin ON public.aid_requests USING GIN(tags) 
  WHERE tags IS NOT NULL AND array_length(tags, 1) > 0;

CREATE INDEX IF NOT EXISTS idx_aid_offers_tags_gin ON public.aid_offers USING GIN(tags) 
  WHERE tags IS NOT NULL AND array_length(tags, 1) > 0;

-- Add VACUUM and ANALYZE for better query planning
-- Note: These should be run regularly, not just once
VACUUM ANALYZE public.events;
VACUUM ANALYZE public.venues;
VACUUM ANALYZE public.profiles;
VACUUM ANALYZE public.aid_requests;
VACUUM ANALYZE public.aid_offers;
VACUUM ANALYZE public.community_posts;