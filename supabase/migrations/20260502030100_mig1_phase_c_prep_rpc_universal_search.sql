-- ADR 0002 MIG-1 phase C prep: update universal_search RPC.
-- Replaces v.featured / e.featured (venues + events) with v.is_featured /
-- e.is_featured. Output column name `featured` is preserved so calling code
-- doesn't change shape. Other tables' featured columns (marketplace,
-- hotels, queer_villages, festivals) are NOT in MIG-1 scope — left alone.
-- Already applied to prod via Supabase MCP on 2026-05-02.

CREATE OR REPLACE FUNCTION public.universal_search(
  search_query text,
  content_types text[] DEFAULT ARRAY['venues','events','cities','countries','news','marketplace','personalities','tags'],
  result_limit integer DEFAULT 10,
  location_filter text DEFAULT NULL,
  featured_only boolean DEFAULT false,
  geo_lat double precision DEFAULT NULL,
  geo_lng double precision DEFAULT NULL,
  radius_km double precision DEFAULT NULL,
  category_filter text DEFAULT NULL
)
RETURNS TABLE(id uuid, content_type text, title text, subtitle text, description text, image_url text, latitude double precision, longitude double precision, slug text, featured boolean, relevance_score real, similarity_score real)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  ts_query tsquery;
  like_pattern TEXT;
BEGIN
  ts_query := plainto_tsquery('english', search_query);
  like_pattern := '%' || search_query || '%';

  RETURN QUERY

  SELECT * FROM (
    SELECT v.id, 'venues'::TEXT, v.name,
      COALESCE(v.city, '') || CASE WHEN v.country IS NOT NULL THEN ', ' || v.country ELSE '' END,
      COALESCE(v.description, ''),
      CASE WHEN v.images IS NOT NULL AND array_length(v.images, 1) > 0 THEN v.images[1] ELSE NULL END,
      v.latitude::double precision, v.longitude::double precision, NULL::TEXT,
      COALESCE(v.is_featured, false),
      CASE WHEN to_tsvector('english', COALESCE(v.name, '') || ' ' || COALESCE(v.description, '')) @@ ts_query
        THEN ts_rank(to_tsvector('english', COALESCE(v.name, '') || ' ' || COALESCE(v.description, '')), ts_query) ELSE 0.0 END::REAL,
      GREATEST(similarity(v.name, search_query), word_similarity(search_query, v.name))::REAL
    FROM venues v
    WHERE 'venues' = ANY(content_types)
      AND v.quality_score >= 40
      AND (to_tsvector('english', COALESCE(v.name, '') || ' ' || COALESCE(v.description, '')) @@ ts_query
        OR similarity(v.name, search_query) > 0.2 OR unaccent(v.name) ILIKE unaccent(like_pattern))
      AND (NOT featured_only OR v.is_featured = true)
      AND (location_filter IS NULL OR v.city ILIKE '%' || location_filter || '%' OR v.country ILIKE '%' || location_filter || '%')
      AND (geo_lat IS NULL OR geo_lng IS NULL OR (6371 * acos(cos(radians(geo_lat)) * cos(radians(v.latitude::double precision)) * cos(radians(v.longitude::double precision) - radians(geo_lng)) + sin(radians(geo_lat)) * sin(radians(v.latitude::double precision))) <= radius_km))
    ORDER BY 11 DESC, 12 DESC LIMIT result_limit
  ) venues_results

  UNION ALL

  SELECT * FROM (
    SELECT e.id, 'events'::TEXT, e.title,
      COALESCE(e.venue_name, '') || CASE WHEN e.city IS NOT NULL THEN ', ' || e.city ELSE '' END,
      COALESCE(e.description, ''),
      CASE WHEN e.images IS NOT NULL AND array_length(e.images, 1) > 0 THEN e.images[1] ELSE NULL END,
      e.latitude::double precision, e.longitude::double precision, NULL::TEXT,
      COALESCE(e.is_featured, false),
      CASE WHEN to_tsvector('english', COALESCE(e.title, '') || ' ' || COALESCE(e.description, '')) @@ ts_query
        THEN ts_rank(to_tsvector('english', COALESCE(e.title, '') || ' ' || COALESCE(e.description, '')), ts_query) ELSE 0.0 END::REAL,
      GREATEST(similarity(e.title, search_query), word_similarity(search_query, e.title))::REAL
    FROM events e
    WHERE 'events' = ANY(content_types)
      AND e.quality_score >= 40
      AND (to_tsvector('english', COALESCE(e.title, '') || ' ' || COALESCE(e.description, '')) @@ ts_query
        OR similarity(e.title, search_query) > 0.2 OR unaccent(e.title) ILIKE unaccent(like_pattern))
      AND (NOT featured_only OR e.is_featured = true)
      AND (location_filter IS NULL OR e.city ILIKE '%' || location_filter || '%' OR e.country ILIKE '%' || location_filter || '%')
    ORDER BY 11 DESC, 12 DESC LIMIT result_limit
  ) events_results

  UNION ALL

  SELECT * FROM (
    SELECT c.id, 'cities'::TEXT, c.name, COALESCE(co.name, ''), COALESCE(c.description, ''),
      c.image_url, c.latitude::double precision, c.longitude::double precision, NULL::TEXT, c.is_major_city,
      CASE WHEN to_tsvector('english', COALESCE(c.name, '') || ' ' || COALESCE(c.description, '')) @@ ts_query
        THEN ts_rank(to_tsvector('english', COALESCE(c.name, '') || ' ' || COALESCE(c.description, '')), ts_query) ELSE 0.0 END::REAL,
      GREATEST(similarity(c.name, search_query), word_similarity(search_query, c.name))::REAL
    FROM cities c LEFT JOIN countries co ON c.country_id = co.id
    WHERE 'cities' = ANY(content_types)
      AND (to_tsvector('english', COALESCE(c.name, '') || ' ' || COALESCE(c.description, '')) @@ ts_query
        OR similarity(c.name, search_query) > 0.2 OR unaccent(c.name) ILIKE unaccent(like_pattern))
      AND (NOT featured_only OR c.is_major_city = true)
    ORDER BY 11 DESC, 12 DESC LIMIT result_limit
  ) cities_results

  UNION ALL

  SELECT * FROM (
    SELECT c.id, 'countries'::TEXT, c.name, COALESCE(c.code, ''), COALESCE(c.description, ''),
      c.image_url, NULL::DOUBLE PRECISION, NULL::DOUBLE PRECISION, NULL::TEXT, false,
      CASE WHEN to_tsvector('english', COALESCE(c.name, '') || ' ' || COALESCE(c.description, '')) @@ ts_query
        THEN ts_rank(to_tsvector('english', COALESCE(c.name, '') || ' ' || COALESCE(c.description, '')), ts_query) ELSE 0.0 END::REAL,
      GREATEST(similarity(c.name, search_query), word_similarity(search_query, c.name))::REAL
    FROM countries c
    WHERE 'countries' = ANY(content_types)
      AND (to_tsvector('english', COALESCE(c.name, '') || ' ' || COALESCE(c.description, '')) @@ ts_query
        OR similarity(c.name, search_query) > 0.2 OR unaccent(c.name) ILIKE unaccent(like_pattern))
    ORDER BY 11 DESC, 12 DESC LIMIT result_limit
  ) countries_results

  UNION ALL

  SELECT * FROM (
    SELECT n.id, 'news'::TEXT, n.title, COALESCE(ns.name, ''), COALESCE(n.excerpt, ''),
      n.image_url, NULL::DOUBLE PRECISION, NULL::DOUBLE PRECISION, NULL::TEXT,
      COALESCE(n.is_featured, false),
      CASE WHEN to_tsvector('english', COALESCE(n.title, '') || ' ' || COALESCE(n.excerpt, '')) @@ ts_query
        THEN ts_rank(to_tsvector('english', COALESCE(n.title, '') || ' ' || COALESCE(n.excerpt, '')), ts_query) ELSE 0.0 END::REAL,
      GREATEST(similarity(n.title, search_query), word_similarity(search_query, n.title))::REAL
    FROM news_articles n
    LEFT JOIN news_sources ns ON n.source_id = ns.id
    WHERE 'news' = ANY(content_types)
      AND n.quality_score >= 40
      AND (to_tsvector('english', COALESCE(n.title, '') || ' ' || COALESCE(n.excerpt, '')) @@ ts_query
        OR similarity(n.title, search_query) > 0.2 OR unaccent(n.title) ILIKE unaccent(like_pattern))
      AND (NOT featured_only OR n.is_featured = true)
    ORDER BY 11 DESC, 12 DESC LIMIT result_limit
  ) news_results

  UNION ALL

  SELECT * FROM (
    SELECT m.id, 'marketplace'::TEXT, m.title, COALESCE(m.location, ''), COALESCE(m.description, ''),
      CASE WHEN m.images IS NOT NULL AND array_length(m.images, 1) > 0 THEN m.images[1] ELSE NULL END,
      NULL::DOUBLE PRECISION, NULL::DOUBLE PRECISION, NULL::TEXT, COALESCE(m.featured, false),
      CASE WHEN to_tsvector('english', COALESCE(m.title, '') || ' ' || COALESCE(m.description, '')) @@ ts_query
        THEN ts_rank(to_tsvector('english', COALESCE(m.title, '') || ' ' || COALESCE(m.description, '')), ts_query) ELSE 0.0 END::REAL,
      GREATEST(similarity(m.title, search_query), word_similarity(search_query, m.title))::REAL
    FROM marketplace_listings m
    WHERE 'marketplace' = ANY(content_types)
      AND (to_tsvector('english', COALESCE(m.title, '') || ' ' || COALESCE(m.description, '')) @@ ts_query
        OR similarity(m.title, search_query) > 0.2 OR unaccent(m.title) ILIKE unaccent(like_pattern))
      AND (NOT featured_only OR m.featured = true)
    ORDER BY 11 DESC, 12 DESC LIMIT result_limit
  ) marketplace_results

  UNION ALL

  SELECT * FROM (
    SELECT p.id, 'personalities'::TEXT, p.name, COALESCE(p.profession, ''), COALESCE(p.bio, ''),
      p.image_url, NULL::DOUBLE PRECISION, NULL::DOUBLE PRECISION, NULL::TEXT, false,
      CASE WHEN to_tsvector('english', COALESCE(p.name, '') || ' ' || COALESCE(p.bio, '')) @@ ts_query
        THEN ts_rank(to_tsvector('english', COALESCE(p.name, '') || ' ' || COALESCE(p.bio, '')), ts_query) ELSE 0.0 END::REAL,
      GREATEST(similarity(p.name, search_query), word_similarity(search_query, p.name))::REAL
    FROM personalities p
    WHERE 'personalities' = ANY(content_types)
      AND p.quality_score >= 40
      AND (to_tsvector('english', COALESCE(p.name, '') || ' ' || COALESCE(p.bio, '')) @@ ts_query
        OR similarity(p.name, search_query) > 0.2 OR unaccent(p.name) ILIKE unaccent(like_pattern))
    ORDER BY 11 DESC, 12 DESC LIMIT result_limit
  ) personalities_results

  UNION ALL

  SELECT * FROM (
    SELECT t.id, 'tags'::TEXT, t.name, COALESCE(tc.name, ''), COALESCE(t.description, ''),
      t.image_url, NULL::DOUBLE PRECISION, NULL::DOUBLE PRECISION, t.name as slug, false,
      CASE WHEN to_tsvector('english', COALESCE(t.name, '') || ' ' || COALESCE(t.description, '')) @@ ts_query
        THEN ts_rank(to_tsvector('english', COALESCE(t.name, '') || ' ' || COALESCE(t.description, '')), ts_query) ELSE 0.0 END::REAL,
      GREATEST(similarity(t.name, search_query), word_similarity(search_query, t.name))::REAL
    FROM unified_tags t LEFT JOIN tag_categories tc ON t.category_id = tc.id
    WHERE 'tags' = ANY(content_types)
      AND t.status = 'active'
      AND (to_tsvector('english', COALESCE(t.name, '') || ' ' || COALESCE(t.description, '')) @@ ts_query
        OR similarity(t.name, search_query) > 0.2 OR unaccent(t.name) ILIKE unaccent(like_pattern))
    ORDER BY 11 DESC, 12 DESC LIMIT result_limit
  ) tags_results

  UNION ALL

  SELECT * FROM (
    SELECT h.id, 'hotels'::TEXT, h.name,
      COALESCE(h.city, '') || CASE WHEN h.country IS NOT NULL THEN ', ' || h.country ELSE '' END,
      COALESCE(h.description, ''),
      CASE WHEN h.images IS NOT NULL AND array_length(h.images, 1) > 0 THEN h.images[1] ELSE NULL END,
      h.latitude, h.longitude, NULL::TEXT, COALESCE(h.featured, false),
      CASE WHEN to_tsvector('english', COALESCE(h.name, '') || ' ' || COALESCE(h.description, '')) @@ ts_query
        THEN ts_rank(to_tsvector('english', COALESCE(h.name, '') || ' ' || COALESCE(h.description, '')), ts_query) ELSE 0.0 END::REAL,
      GREATEST(similarity(h.name, search_query), word_similarity(search_query, h.name))::REAL
    FROM hotels h
    WHERE 'hotels' = ANY(content_types)
      AND (to_tsvector('english', COALESCE(h.name, '') || ' ' || COALESCE(h.description, '')) @@ ts_query
        OR similarity(h.name, search_query) > 0.2 OR unaccent(h.name) ILIKE unaccent(like_pattern))
      AND (NOT featured_only OR h.featured = true)
    ORDER BY 11 DESC, 12 DESC LIMIT result_limit
  ) hotels_results

  UNION ALL

  SELECT * FROM (
    SELECT qv.id, 'queer_villages'::TEXT, qv.name,
      COALESCE(c.name, '') || CASE WHEN co.name IS NOT NULL THEN ', ' || co.name ELSE '' END,
      COALESCE(qv.description, ''), qv.image_url, qv.latitude, qv.longitude, qv.slug,
      COALESCE(qv.featured, false),
      CASE WHEN to_tsvector('english', COALESCE(qv.name, '') || ' ' || COALESCE(qv.description, '')) @@ ts_query
        THEN ts_rank(to_tsvector('english', COALESCE(qv.name, '') || ' ' || COALESCE(qv.description, '')), ts_query) ELSE 0.0 END::REAL,
      GREATEST(similarity(qv.name, search_query), word_similarity(search_query, qv.name))::REAL
    FROM queer_villages qv
    LEFT JOIN cities c ON qv.city_id = c.id
    LEFT JOIN countries co ON qv.country_id = co.id
    WHERE 'queer_villages' = ANY(content_types)
      AND (to_tsvector('english', COALESCE(qv.name, '') || ' ' || COALESCE(qv.description, '')) @@ ts_query
        OR similarity(qv.name, search_query) > 0.2 OR unaccent(qv.name) ILIKE unaccent(like_pattern))
      AND (NOT featured_only OR qv.featured = true)
    ORDER BY 11 DESC, 12 DESC LIMIT result_limit
  ) villages_results

  UNION ALL

  SELECT * FROM (
    SELECT f.id, 'festivals'::TEXT, f.name,
      COALESCE(f.city, '') || CASE WHEN f.country IS NOT NULL THEN ', ' || f.country ELSE '' END,
      COALESCE(f.description, ''),
      CASE WHEN f.images IS NOT NULL AND array_length(f.images, 1) > 0 THEN f.images[1] ELSE NULL END,
      f.latitude, f.longitude, f.slug,
      COALESCE(f.featured, false),
      CASE WHEN to_tsvector('english', COALESCE(f.name, '') || ' ' || COALESCE(f.description, '')) @@ ts_query
        THEN ts_rank(to_tsvector('english', COALESCE(f.name, '') || ' ' || COALESCE(f.description, '')), ts_query) ELSE 0.0 END::REAL,
      GREATEST(similarity(f.name, search_query), word_similarity(search_query, f.name))::REAL
    FROM festivals f
    WHERE 'festivals' = ANY(content_types)
      AND (to_tsvector('english', COALESCE(f.name, '') || ' ' || COALESCE(f.description, '')) @@ ts_query
        OR similarity(f.name, search_query) > 0.2 OR unaccent(f.name) ILIKE unaccent(like_pattern))
      AND (NOT featured_only OR f.featured = true)
    ORDER BY 11 DESC, 12 DESC LIMIT result_limit
  ) festivals_results

  ORDER BY 11 DESC, 12 DESC;
END;
$function$;
