-- ADR 0002 MIG-1 phase C prep: rewrite search_events and
-- get_tag_linked_content RPCs to use is_featured for venues + events.
-- Already applied to prod via Supabase MCP on 2026-05-02.

CREATE OR REPLACE FUNCTION public.search_events(
  p_city text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_start timestamp with time zone DEFAULT NULL,
  p_end timestamp with time zone DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_accessibility_attributes text[] DEFAULT NULL,
  p_target_groups text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_include_past boolean DEFAULT false,
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(total bigint, event jsonb)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH filtered AS (
    SELECT e.*
    FROM public.events e
    WHERE e.status = 'active'
      AND (
        CASE
          WHEN p_include_past THEN e.start_date <= now()
          ELSE COALESCE(e.end_date, e.start_date) >= now()
        END
      )
      AND (
        p_city IS NULL
        OR public.immutable_unaccent(lower(e.city))
           ILIKE '%' || public.immutable_unaccent(lower(p_city)) || '%'
      )
      AND (p_event_type IS NULL OR e.event_type = p_event_type)
      AND (p_end   IS NULL OR e.start_date                       <= p_end)
      AND (p_start IS NULL OR COALESCE(e.end_date, e.start_date) >= p_start)
      AND (p_accessibility_attributes IS NULL OR e.accessibility_attributes && p_accessibility_attributes)
      AND (p_target_groups IS NULL OR e.target_groups && p_target_groups)
      AND (
        p_search IS NULL
        OR e.title ILIKE '%' || p_search || '%'
        OR e.description ILIKE '%' || p_search || '%'
      )
  ),
  counted AS (SELECT count(*)::BIGINT AS total FROM filtered),
  paged AS (
    SELECT f.*
    FROM filtered f
    ORDER BY f.is_featured DESC,
             CASE WHEN p_include_past THEN f.start_date END DESC,
             CASE WHEN NOT p_include_past THEN f.start_date END ASC
    LIMIT  GREATEST(COALESCE(p_limit, 24), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  )
  SELECT
    (SELECT total FROM counted) AS total,
    to_jsonb(p) || jsonb_build_object(
      'venues',
      CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id',      v.id,
        'name',    v.name,
        'address', v.address,
        'city',    v.city,
        'state',   v.state,
        'country', v.country,
        'phone',   v.phone,
        'website', v.website,
        'email',   v.email
      ) END
    ) AS event
  FROM paged p
  LEFT JOIN public.venues v ON v.id = p.venue_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_tag_linked_content(
  p_tag_id uuid, p_tag_name text, p_tag_slug text, p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'venues', COALESCE((
      SELECT jsonb_agg(row_to_json(v_row))
      FROM (
        SELECT v.id, v.name, v.city, v.country, v.category,
               v.images[1] AS image_url, v.foursquare_rating, v.address, v.slug
        FROM unified_tag_assignments uta
        JOIN venues v ON v.id = uta.entity_id
        WHERE uta.tag_id = p_tag_id
          AND uta.entity_type IN ('venue', 'venues')
        ORDER BY v.is_featured DESC NULLS LAST, v.foursquare_rating DESC NULLS LAST
        LIMIT p_limit
      ) v_row
    ), '[]'::jsonb),

    'events', COALESCE((
      SELECT jsonb_agg(row_to_json(e_row))
      FROM (
        SELECT e.id, e.title, e.start_date, e.end_date, e.city,
               e.country, e.images[1] AS image_url, e.event_type, e.slug,
               ev.name AS venue_name
        FROM unified_tag_assignments uta
        JOIN events e ON e.id = uta.entity_id
        LEFT JOIN venues ev ON ev.id = e.venue_id
        WHERE uta.tag_id = p_tag_id
          AND uta.entity_type IN ('event', 'events')
          AND e.status = 'active'
        ORDER BY e.is_featured DESC NULLS LAST, e.start_date DESC NULLS LAST
        LIMIT p_limit
      ) e_row
    ), '[]'::jsonb),

    'news', COALESCE((
      SELECT jsonb_agg(row_to_json(n_row))
      FROM (
        SELECT na.id, na.title, na.published_at, na.image_url,
               na.excerpt, na.url,
               CASE WHEN ns.name IS NOT NULL
                 THEN jsonb_build_object('name', ns.name)
                 ELSE NULL
               END AS news_sources
        FROM unified_tag_assignments uta
        JOIN news_articles na ON na.id = uta.entity_id
        LEFT JOIN news_sources ns ON ns.id = na.source_id
        WHERE uta.tag_id = p_tag_id
          AND uta.entity_type IN ('news_article', 'news')
        ORDER BY na.is_featured DESC NULLS LAST, na.published_at DESC NULLS LAST
        LIMIT p_limit
      ) n_row
    ), '[]'::jsonb),

    'personalities', COALESCE((
      SELECT jsonb_agg(row_to_json(p_row))
      FROM (
        SELECT p.id, p.name, p.profession, p.nationality,
               p.image_url, p.birth_date, p.death_date, p.slug
        FROM personalities p
        WHERE p.visibility = 'public'
          AND (
            p_tag_name = ANY(p.tags)
            OR p_tag_slug = ANY(p.tags)
            OR lower(p_tag_name) = ANY(
              SELECT lower(unnest(p.tags))
            )
          )
        ORDER BY p.is_featured DESC NULLS LAST, p.view_count DESC NULLS LAST
        LIMIT p_limit
      ) p_row
    ), '[]'::jsonb),

    'groups', COALESCE((
      SELECT jsonb_agg(row_to_json(g_row))
      FROM (
        SELECT cg.id, cg.name, cg.description, cg.image_url AS avatar_url,
               cg.member_count,
               CASE WHEN cg.is_private THEN 'private' ELSE 'public' END AS privacy
        FROM unified_tag_assignments uta
        JOIN community_groups cg ON cg.id = uta.entity_id
        WHERE uta.tag_id = p_tag_id
          AND uta.entity_type IN ('community_group', 'group')
        ORDER BY cg.member_count DESC NULLS LAST
        LIMIT p_limit
      ) g_row
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;
