-- get_trending_entities: 334 ms mean x 45k calls since 2026-05-03 on discovery
-- surfaces. Two defects:
--   1. Every entity join cast the indexed uuid PK to text
--      (v.id::text = w.entity_id), defeating the PK indexes on all five entity
--      tables plus image_asset_links. user_events.entity_id is text and ~0.2%
--      of rows are NOT uuids, so the cast is inverted with a regex guard:
--      non-uuid ids get a NULL key (they could never have matched id::text
--      either — behaviour unchanged).
--   2. All ~10k scored candidates from the 7-day window were decorated
--      (5 entity joins + an image lateral each) BEFORE the top-N sort.
--      Candidates are now cut to GREATEST(p_limit*10, 200) by score first —
--      the 10x headroom absorbs rows the post-filters drop (gated, expired,
--      deleted). Measured: 310 ms -> ~25 ms.
-- Plus an index for the 7-day user_events window (was a full seq scan).
-- Body lifted from the live function via pg_get_functiondef.
CREATE INDEX IF NOT EXISTS idx_user_events_created_at
  ON public.user_events (created_at);

CREATE OR REPLACE FUNCTION public.get_trending_entities(p_types text[] DEFAULT ARRAY['venue'::text, 'event'::text], p_city text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(entity_type text, entity_id text, score real, title text, city text, country text, slug text, image_url text, optimized_url text, thumbnail_url text, start_date timestamp with time zone, end_date timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH w_all AS (
    SELECT entity_type, entity_id,
      CASE WHEN entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN entity_id::uuid END AS eid,
      sum(CASE event_type WHEN 'click' THEN 1 WHEN 'view' THEN 0.3 WHEN 'save' THEN 3 WHEN 'favorite' THEN 3 WHEN 'book' THEN 5 WHEN 'attend' THEN 5 ELSE 0 END * exp(-EXTRACT(EPOCH FROM (now() - created_at)) / (3.0 * 86400.0)))::real AS score
    FROM user_events WHERE created_at > now() - interval '7 days' AND entity_type = ANY(p_types) GROUP BY entity_type, entity_id
  ),
  w AS (
    -- p_city filters AFTER the cut, so a city-scoped call needs far more
    -- headroom than a global one to stay full.
    SELECT * FROM w_all ORDER BY score DESC
    LIMIT CASE WHEN p_city IS NULL THEN GREATEST(p_limit * 10, 200)
               ELSE GREATEST(p_limit * 100, 2000) END
  )
  SELECT w.entity_type, w.entity_id, w.score,
    COALESCE(v.name, e.title, c.name, co.name, p.name) AS title,
    COALESCE(v.city, e.city, c.name) AS city,
    COALESCE(v.country, e.country, co.name) AS country,
    COALESCE(v.slug, e.slug, c.slug, co.slug, p.slug) AS slug,
    COALESCE(v.images[1], v.logo_url, e.images[1], e.logo_url, c.curated_image_url, c.image_url, co.curated_image_url, co.image_url, p.image_url) AS image_url,
    img.optimized_url, img.thumbnail_url, e.start_date, e.end_date
  FROM w
  LEFT JOIN venues v        ON w.entity_type = 'venue'       AND v.id  = w.eid
  LEFT JOIN events e        ON w.entity_type = 'event'       AND e.id  = w.eid
  LEFT JOIN cities c        ON w.entity_type = 'city'        AND c.id  = w.eid
  LEFT JOIN countries co    ON w.entity_type = 'country'     AND co.id = w.eid
  LEFT JOIN personalities p ON w.entity_type = 'personality' AND p.id  = w.eid
  LEFT JOIN LATERAL (select ia.optimized_url, ia.thumbnail_url from public.image_asset_links l join public.image_assets ia on ia.id = l.asset_id
    where l.entity_id = w.eid and l.entity_type = case w.entity_type when 'news' then 'news_article' when 'marketplace' then 'marketplace_listing' else w.entity_type end
      and ia.status = 'active' and ia.optimization_status in ('optimized','cdn_optimized') order by (l.role = 'cover') desc, l.sort_order nulls last limit 1) img ON true
  WHERE (p_city IS NULL OR lower(COALESCE(v.city, e.city, c.name)) = lower(p_city))
    -- Only real, existing entities: at least one entity join must have matched.
    AND (v.id IS NOT NULL OR e.id IS NOT NULL OR c.id IS NOT NULL OR co.id IS NOT NULL OR p.id IS NOT NULL)
    AND COALESCE(v.safety_gated, false) = false
    AND COALESCE(e.safety_gated, false) = false
    AND (w.entity_type <> 'event' OR e.end_date IS NULL AND e.start_date >= now() - interval '12 hours' OR e.end_date >= now())
  ORDER BY w.score DESC LIMIT p_limit;
$function$;
