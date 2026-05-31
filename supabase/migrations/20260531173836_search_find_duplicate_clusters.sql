-- Corpus-wide duplicate sweep over search_documents (plan §10.4). Complements the
-- per-item find_duplicates() with a cheap exact-normalized-title pass that surfaces
-- existing duplicate clusters within an entity type for merge review (e.g. the
-- Berghain / KitKatClub / The Eagle duplicate venue rows). Deeper reworded/cross-
-- source dupes are caught at creation time by find_duplicates() (trigram + vector).
-- Admin/ops tool — not exposed to anon.
-- NOTE: superseded in 20260531173909 (cluster by title + city to drop same-name-
-- different-city false positives).
create or replace function public.find_duplicate_clusters(
  p_content_type text,
  p_limit        int default 100
) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  with norm as (
    select entity_id, title, city, country, slug,
           lower(unaccent(btrim(coalesce(title,'')))) as nt
    from public.search_documents
    where entity_type = p_content_type and title is not null and length(btrim(title)) >= 3
  ),
  groups as (
    select nt, count(*) as c,
           jsonb_agg(jsonb_build_object('id', entity_id, 'title', title, 'city', city,
                                        'country', country, 'slug', slug)
                     order by city nulls last) as members
    from norm group by nt having count(*) > 1
  )
  select coalesce((
    select jsonb_agg(jsonb_build_object('normalized_title', nt, 'count', c, 'members', members) order by c desc)
    from (select * from groups order by c desc, nt limit greatest(p_limit, 0)) x
  ), '[]'::jsonb);
$$;

revoke all on function public.find_duplicate_clusters(text, int) from public, anon;
grant execute on function public.find_duplicate_clusters(text, int) to authenticated, service_role;
