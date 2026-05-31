-- Embedding-based "related / more like this" over search_documents (plan §10.2).
-- The clean PG replacement for the Worker's /similar: returns ready-to-render
-- cards (display fields are already on search_documents), liveness-filtered,
-- same- or cross-type. plpgsql with a local vector var so the HNSW knn is index-driven.
create or replace function public.related_entities(
  p_entity_type   text,
  p_entity_id     uuid,
  p_content_types text[]      default null,
  p_same_type_only boolean    default false,
  p_limit         int         default 10,
  p_now           timestamptz default now()
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  v extensions.vector(1024);
begin
  select embedding into v from public.search_documents
   where entity_type = p_entity_type and entity_id = p_entity_id;
  if v is null then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'objectID', entity_id, 'type', entity_type, 'title', title,
        'description', left(description, 200), 'city', city, 'country', country,
        'slug', slug, 'imageUrl', image_url, 'category', facets->>'category',
        'featured', is_featured, '_score', round(sim::numeric, 4)
      ) order by sim desc)
    from (
      select sd.entity_id, sd.entity_type, sd.title, sd.description, sd.city, sd.country,
             sd.slug, sd.image_url, sd.facets, sd.is_featured,
             1 - (sd.embedding <=> v) as sim
      from public.search_documents sd
      where sd.embedding is not null
        and not (sd.entity_type = p_entity_type and sd.entity_id = p_entity_id)
        and (p_content_types is null or sd.entity_type = any(p_content_types))
        and (not p_same_type_only or sd.entity_type = p_entity_type)
        and (sd.entity_type <> 'event' or sd.start_date is null or coalesce(sd.end_date, sd.start_date) >= p_now - interval '1 day')
        and coalesce(sd.liveness_status,'') not in ('dead','cancelled','dead_link')
        and sd.closed_at is null
      order by sd.embedding <=> v
      limit greatest(p_limit, 0)
    ) nn
  ), '[]'::jsonb);
end $$;

grant execute on function public.related_entities(text, uuid, text[], boolean, int, timestamptz) to anon, authenticated, service_role;
