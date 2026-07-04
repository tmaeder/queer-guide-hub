-- Tags as a first-class discovery axis — tag page completeness.
--
-- Extend get_tag_linked_content so the canonical tag page (/resources/:slug)
-- aggregates marketplace listings and queer villages too, now that both carry
-- tags. Marketplace links via the unified_tag_assignments junction
-- ('marketplace_listing'); villages match the tag slug against their tags[]
-- array column. Existing sections (venues/events/news/personalities/groups)
-- are unchanged.

create or replace function public.get_tag_linked_content(
  p_tag_id uuid, p_tag_name text, p_tag_slug text, p_limit integer default 20
) returns jsonb
language plpgsql
set search_path to 'public'
as $function$
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
            OR lower(p_tag_name) = ANY(SELECT lower(unnest(p.tags)))
          )
        ORDER BY p.is_featured DESC NULLS LAST, p.view_count DESC NULLS LAST
        LIMIT p_limit
      ) p_row
    ), '[]'::jsonb),

    'marketplace', COALESCE((
      SELECT jsonb_agg(row_to_json(m_row))
      FROM (
        SELECT m.id, m.title, m.brand, m.business_name, m.category,
               m.price, m.price_usd, m.currency,
               m.images[1] AS image_url, m.slug
        FROM unified_tag_assignments uta
        JOIN marketplace_listings m ON m.id = uta.entity_id
        WHERE uta.tag_id = p_tag_id
          AND uta.entity_type IN ('marketplace_listing', 'marketplace')
          AND COALESCE(m.status, 'active') = 'active'
        ORDER BY m.featured DESC NULLS LAST, m.quality_score DESC NULLS LAST
        LIMIT p_limit
      ) m_row
    ), '[]'::jsonb),

    'queer_villages', COALESCE((
      SELECT jsonb_agg(row_to_json(qv_row))
      FROM (
        SELECT qv.id, qv.name, qv.slug,
               COALESCE(qv.image_url, qv.images[1]) AS image_url,
               ci.name AS city, co.name AS country
        FROM queer_villages qv
        LEFT JOIN cities ci ON ci.id = qv.city_id
        LEFT JOIN countries co ON co.id = qv.country_id
        WHERE p_tag_slug = ANY(qv.tags)
           OR p_tag_name = ANY(qv.tags)
           OR lower(p_tag_name) = ANY(SELECT lower(unnest(qv.tags)))
        ORDER BY qv.featured DESC NULLS LAST
        LIMIT p_limit
      ) qv_row
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
