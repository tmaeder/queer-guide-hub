-- Tags as a first-class discovery axis — Phase 4 (cross-entity discovery).
--
-- related_by_tags(entity_type, entity_id, limit): returns content of ANY type
-- that shares the most tags with the given entity, ranked by tag-overlap. Reads
-- the denormalized search_documents.facets->'tags' (populated for all types in
-- migration 20260619180000), so a venue can surface related events/news/people,
-- not just other venues. Powers the "More like this" rail on detail pages.
--
-- The expression GIN index supports the corpus-wide facets->'tags' ?| seed scan.
-- Created CONCURRENTLY out-of-band on prod; IF NOT EXISTS here so a fresh CI
-- rebuild gets it without conflicting with the existing index.

create index if not exists search_documents_tags_gin
on public.search_documents using gin ((facets -> 'tags'));

create or replace function public.related_by_tags(
  p_entity_type text,
  p_entity_id uuid,
  p_limit int default 8
) returns jsonb
language sql stable security definer
set search_path to 'public','extensions','pg_temp'
as $$
  with seed as (
    select array(select jsonb_array_elements_text(facets->'tags')) as tags
    from public.search_documents
    where entity_type = p_entity_type and entity_id = p_entity_id
      and jsonb_typeof(facets->'tags') = 'array'
    limit 1
  )
  select coalesce(
    jsonb_agg(row order by overlap desc, is_featured desc, quality_score desc nulls last),
    '[]'::jsonb)
  from (
    select jsonb_build_object(
             'type', sd.entity_type, 'id', sd.entity_id,
             'title', sd.title, 'slug', sd.slug,
             'city', sd.city, 'country', sd.country,
             'image_url', sd.image_url,
             'tags', sd.facets->'tags',
             'overlap', ov.cnt
           ) as row,
           ov.cnt as overlap, sd.is_featured, sd.quality_score
    from public.search_documents sd
    cross join seed
    cross join lateral (
      select count(*) as cnt
      from jsonb_array_elements_text(sd.facets->'tags') x(v)
      where x.v = any(seed.tags)
    ) ov
    where seed.tags is not null and array_length(seed.tags,1) > 0
      and not (sd.entity_type = p_entity_type and sd.entity_id = p_entity_id)
      and jsonb_typeof(sd.facets->'tags') = 'array'
      and sd.facets->'tags' ?| seed.tags
      and sd.closed_at is null
      and sd.liveness_status is distinct from 'dead'
      and (sd.entity_type <> 'event' or sd.start_date is null
           or coalesce(sd.end_date, sd.start_date) >= now() - interval '1 day')
      and ov.cnt > 0
    order by overlap desc, sd.is_featured desc, sd.quality_score desc nulls last
    limit greatest(1, least(p_limit, 24))
  ) ranked;
$$;

grant execute on function public.related_by_tags(text, uuid, int) to anon, authenticated;
