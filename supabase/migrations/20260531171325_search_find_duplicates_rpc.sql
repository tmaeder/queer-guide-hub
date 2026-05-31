-- Unified duplicate-detection over search_documents (plan §10.3). One "is this a
-- dup?" primitive for ingestion, Chrome-extension submissions, and AI content
-- creation. Combines trigram title similarity (GIN-indexed via %) and pgvector
-- cosine (HNSW knn). Caller may pass an embedding (already generated) and/or a
-- title; either leg alone works.
create or replace function public.find_duplicates(
  p_content_type    text,
  p_title           text                    default null,
  p_embedding       extensions.vector(1024) default null,
  p_exclude_id      uuid                     default null,
  p_title_threshold real                     default 0.45,
  p_vec_threshold   real                     default 0.88,
  p_limit           int                      default 5
) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  with ids as (
    select entity_id from public.search_documents
     where entity_type = p_content_type
       and (p_exclude_id is null or entity_id <> p_exclude_id)
       and p_title is not null and p_title <> '' and title % p_title
    union
    (select entity_id from public.search_documents
      where entity_type = p_content_type
        and (p_exclude_id is null or entity_id <> p_exclude_id)
        and p_embedding is not null and embedding is not null
      order by embedding <=> p_embedding
      limit 20)
  ),
  scored as (
    select sd.entity_id, sd.title, sd.slug, sd.city, sd.country, sd.image_url,
      case when p_title is not null and p_title <> '' then similarity(coalesce(sd.title,''), p_title) else 0 end as ts,
      case when p_embedding is not null and sd.embedding is not null then 1 - (sd.embedding <=> p_embedding) else null end as vs
    from public.search_documents sd
    join ids using (entity_id)
  )
  select coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', entity_id, 'title', title, 'slug', slug, 'city', city, 'country', country,
        'image_url', image_url,
        'title_sim', round(ts::numeric, 3),
        'vec_sim', case when vs is not null then round(vs::numeric, 3) end,
        'match', case when ts >= p_title_threshold and (vs is not null and vs >= p_vec_threshold) then 'both'
                      when ts >= p_title_threshold then 'title' else 'vector' end
      ) order by greatest(coalesce(ts,0), coalesce(vs,0)) desc)
    from (
      select * from scored
      where ts >= p_title_threshold or (vs is not null and vs >= p_vec_threshold)
      order by greatest(coalesce(ts,0), coalesce(vs,0)) desc
      limit greatest(p_limit, 0)
    ) x
  ), '[]'::jsonb);
$$;

revoke all on function public.find_duplicates(text, text, extensions.vector, uuid, real, real, int) from public, anon;
grant execute on function public.find_duplicates(text, text, extensions.vector, uuid, real, real, int) to authenticated, service_role;
