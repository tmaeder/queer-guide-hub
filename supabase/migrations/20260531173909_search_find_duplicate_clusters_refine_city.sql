-- Refine the duplicate sweep: cluster by normalized title + city so same-name
-- venues in different cities (Starbucks Berlin vs Madrid) are NOT flagged as
-- dupes, while same-name-same-city pairs (the real dupes) are. Types without a
-- meaningful city (cities/countries/tags/personalities/news) coalesce city to ''
-- and so fall back to title-only grouping. (Venue dup clusters: 1981 -> 153.)
create or replace function public.find_duplicate_clusters(
  p_content_type text,
  p_limit        int default 100
) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  with norm as (
    select entity_id, title, city, country, slug,
           lower(unaccent(btrim(coalesce(title,'')))) as nt,
           coalesce(lower(unaccent(btrim(city))), '')  as nc
    from public.search_documents
    where entity_type = p_content_type and title is not null and length(btrim(title)) >= 3
  ),
  groups as (
    select nt, nc, count(*) as c,
           jsonb_agg(jsonb_build_object('id', entity_id, 'title', title, 'city', city,
                                        'country', country, 'slug', slug)
                     order by slug nulls last) as members
    from norm group by nt, nc having count(*) > 1
  )
  select coalesce((
    select jsonb_agg(jsonb_build_object('normalized_title', nt, 'city', nullif(nc,''),
                                        'count', c, 'members', members) order by c desc)
    from (select * from groups order by c desc, nt limit greatest(p_limit, 0)) x
  ), '[]'::jsonb);
$$;
