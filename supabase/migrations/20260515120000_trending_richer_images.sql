-- Trending RPC was returning image_url=null for ~80% of cards because the
-- COALESCE only checked logo_url-style columns and skipped:
--   * venues.images[] / events.images[] (the actual cover-photo arrays)
--   * cities.image_url / curated_image_url
--   * countries.image_url / curated_image_url
-- Counts in prod (2026-05-15): venues 983 with images vs 1355 with logo;
-- events 1880 with images vs 265 with logo; cities 504 with image_url; etc.
-- This migration broadens the coalesce. Signature, ordering, filter, grants
-- unchanged from 20260504020000.

CREATE OR REPLACE FUNCTION public.get_trending_entities(
  p_types text[] DEFAULT ARRAY['venue'::text, 'event'::text],
  p_city  text   DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  entity_type text,
  entity_id   text,
  score       real,
  title       text,
  city        text,
  country     text,
  slug        text,
  image_url   text,
  start_date  timestamptz,
  end_date    timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  WITH w AS (
    SELECT entity_type, entity_id,
      sum(
        CASE event_type
          WHEN 'click'    THEN 1
          WHEN 'view'     THEN 0.3
          WHEN 'save'     THEN 3
          WHEN 'favorite' THEN 3
          WHEN 'book'     THEN 5
          WHEN 'attend'   THEN 5
          ELSE 0
        END
        * exp(-EXTRACT(EPOCH FROM (now() - created_at)) / (3.0 * 86400.0))
      )::real AS score
    FROM user_events
    WHERE created_at > now() - interval '7 days'
      AND entity_type = ANY(p_types)
    GROUP BY entity_type, entity_id
  )
  SELECT
    w.entity_type,
    w.entity_id,
    w.score,
    COALESCE(v.name, e.title, c.name, p.name) AS title,
    COALESCE(v.city, e.city, c.name) AS city,
    COALESCE(v.country, e.country, co.name) AS country,
    COALESCE(v.slug, e.slug, c.slug, p.slug) AS slug,
    COALESCE(
      v.images[1], v.logo_url,
      e.images[1], e.logo_url,
      c.curated_image_url, c.image_url,
      co.curated_image_url, co.image_url,
      p.image_url
    ) AS image_url,
    e.start_date,
    e.end_date
  FROM w
  LEFT JOIN venues v        ON w.entity_type = 'venue'       AND v.id::text  = w.entity_id
  LEFT JOIN events e        ON w.entity_type = 'event'       AND e.id::text  = w.entity_id
  LEFT JOIN cities c        ON w.entity_type = 'city'        AND c.id::text  = w.entity_id
  LEFT JOIN countries co    ON w.entity_type = 'country'     AND co.id::text = w.entity_id
  LEFT JOIN personalities p ON w.entity_type = 'personality' AND p.id::text  = w.entity_id
  WHERE (p_city IS NULL OR lower(COALESCE(v.city, e.city, c.name)) = lower(p_city))
    AND (
      w.entity_type <> 'event'
      OR e.end_date IS NULL AND e.start_date >= now() - interval '12 hours'
      OR e.end_date >= now()
    )
  ORDER BY w.score DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_trending_entities(text[], text, integer) FROM PUBLIC;
GRANT  ALL ON FUNCTION public.get_trending_entities(text[], text, integer) TO service_role;
GRANT  ALL ON FUNCTION public.get_trending_entities(text[], text, integer) TO anon;
GRANT  ALL ON FUNCTION public.get_trending_entities(text[], text, integer) TO authenticated;
