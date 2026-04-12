-- Create RPC function for fetching all linked content for a tag/resource
-- Called by useTagContent hook on the resource detail page

DROP FUNCTION IF EXISTS public.get_tag_linked_content(UUID, TEXT, TEXT, INT);

CREATE OR REPLACE FUNCTION public.get_tag_linked_content(
  p_tag_id UUID,
  p_tag_name TEXT,
  p_tag_slug TEXT,
  p_limit INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
        ORDER BY v.featured DESC NULLS LAST, v.foursquare_rating DESC NULLS LAST
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
        ORDER BY e.featured DESC NULLS LAST, e.start_date DESC NULLS LAST
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
$$;

GRANT EXECUTE ON FUNCTION public.get_tag_linked_content(UUID, TEXT, TEXT, INT) TO anon, authenticated;
