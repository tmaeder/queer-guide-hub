-- get_entity_detail — single-record fetch for the MCP server (and any client
-- that has an objectID/slug from search). Reads the denormalized
-- search_documents row (already excludes duplicate_of_id IS NOT NULL via the
-- sync), so it returns the same safety-bearing fields search exposes —
-- trust_score, liveness_status, geo — plus the FULL description (search only
-- ships left(description,300)).
--
-- Lookup by (type, id) or (type, slug). security definer + granted to anon so
-- the public MCP read path needs no service key for detail fetches.
create or replace function public.get_entity_detail(
  p_type text,
  p_id   uuid default null,
  p_slug text default null
) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object(
    'objectID',        entity_id,
    'doc_id',          doc_id,
    'type',            entity_type,
    'title',           title,
    'description',     description,
    'category',        facets->>'category',
    'city',            city,
    'country',         country,
    'location',        nullif(concat_ws(', ', city, country), ''),
    'slug',            slug,
    'imageUrl',        image_url,
    'featured',        is_featured,
    'is_free',         is_free,
    'price_min',       price_min,
    'price_max',       price_max,
    'start_date',      extract(epoch from start_date),
    'end_date',        extract(epoch from end_date),
    'trust_score',     trust_score,
    'quality_score',   quality_score,
    'liveness_status', liveness_status,
    'closed_at',       extract(epoch from closed_at),
    'content_language', content_language,
    'updated_at',      extract(epoch from updated_at),
    'tags',            facets->'tags',
    'facets',          facets,
    '_geoloc',         case when geog is not null
                         then jsonb_build_object('lat', st_y(geog::geometry), 'lng', st_x(geog::geometry))
                       end
  )
  from public.search_documents
  where entity_type = p_type
    and (
      (p_id   is not null and entity_id = p_id)
      or (p_slug is not null and slug = p_slug)
    )
  order by (p_id is not null and entity_id = p_id) desc  -- prefer id match
  limit 1;
$$;

grant execute on function public.get_entity_detail(text, uuid, text) to anon, authenticated, service_role;
