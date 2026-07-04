-- Trending must only surface EXISTING entities.
--
-- get_trending_entities aggregates user_events and LEFT JOINs the entity
-- tables for display fields. A tracked entity_id that matches no entity (e.g.
-- the nil-UUID junk rows produced by test/placeholder tracking events) sailed
-- through with an all-null payload — clients had to defensively drop it.
-- Spotted in the 2026-07-02 prod spot-check: a `venue` trending hit with
-- entity_id 00000000-…-000000 and null title/slug.
--
-- Changes:
--   1. Require the entity to actually exist (one of the joins must match).
--      Types the function doesn't join (news/marketplace/…) now return no
--      rows instead of null-payload rows — same client-visible outcome,
--      without shipping junk.
--   2. Countries were unlinkable: title/slug COALESCEs never included
--      co.name/co.slug, so a trending country always had a null title and
--      got dropped client-side. Include them.
CREATE OR REPLACE FUNCTION public.get_trending_entities(
  p_types text[] DEFAULT ARRAY['venue'::text, 'event'::text],
  p_city text DEFAULT NULL::text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  entity_type text, entity_id text, score real, title text, city text,
  country text, slug text, image_url text, optimized_url text,
  thumbnail_url text, start_date timestamp with time zone,
  end_date timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  WITH w AS (
    SELECT entity_type, entity_id,
      sum(CASE event_type WHEN 'click' THEN 1 WHEN 'view' THEN 0.3 WHEN 'save' THEN 3 WHEN 'favorite' THEN 3 WHEN 'book' THEN 5 WHEN 'attend' THEN 5 ELSE 0 END * exp(-EXTRACT(EPOCH FROM (now() - created_at)) / (3.0 * 86400.0)))::real AS score
    FROM user_events WHERE created_at > now() - interval '7 days' AND entity_type = ANY(p_types) GROUP BY entity_type, entity_id
  )
  SELECT w.entity_type, w.entity_id, w.score,
    COALESCE(v.name, e.title, c.name, co.name, p.name) AS title,
    COALESCE(v.city, e.city, c.name) AS city,
    COALESCE(v.country, e.country, co.name) AS country,
    COALESCE(v.slug, e.slug, c.slug, co.slug, p.slug) AS slug,
    COALESCE(v.images[1], v.logo_url, e.images[1], e.logo_url, c.curated_image_url, c.image_url, co.curated_image_url, co.image_url, p.image_url) AS image_url,
    img.optimized_url, img.thumbnail_url, e.start_date, e.end_date
  FROM w
  LEFT JOIN venues v        ON w.entity_type = 'venue'       AND v.id::text  = w.entity_id
  LEFT JOIN events e        ON w.entity_type = 'event'       AND e.id::text  = w.entity_id
  LEFT JOIN cities c        ON w.entity_type = 'city'        AND c.id::text  = w.entity_id
  LEFT JOIN countries co    ON w.entity_type = 'country'     AND co.id::text = w.entity_id
  LEFT JOIN personalities p ON w.entity_type = 'personality' AND p.id::text  = w.entity_id
  LEFT JOIN LATERAL (select ia.optimized_url, ia.thumbnail_url from public.image_asset_links l join public.image_assets ia on ia.id = l.asset_id
    where l.entity_id::text = w.entity_id and l.entity_type = case w.entity_type when 'news' then 'news_article' when 'marketplace' then 'marketplace_listing' else w.entity_type end
      and ia.status = 'active' and ia.optimization_status in ('optimized','cdn_optimized') order by (l.role = 'cover') desc, l.sort_order nulls last limit 1) img ON true
  WHERE (p_city IS NULL OR lower(COALESCE(v.city, e.city, c.name)) = lower(p_city))
    -- Only real, existing entities: at least one entity join must have matched.
    AND (v.id IS NOT NULL OR e.id IS NOT NULL OR c.id IS NOT NULL OR co.id IS NOT NULL OR p.id IS NOT NULL)
    AND COALESCE(v.safety_gated, false) = false
    AND COALESCE(e.safety_gated, false) = false
    AND (w.entity_type <> 'event' OR e.end_date IS NULL AND e.start_date >= now() - interval '12 hours' OR e.end_date >= now())
  ORDER BY w.score DESC LIMIT p_limit;
$function$;
