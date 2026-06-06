-- M-7 (audit 2026-06-05) — cross-source news syndication dedup.
-- find_duplicate_clusters('news') grouped news by normalized title only, with no
-- date key, so it conflated same-title articles from different days and didn't
-- isolate the syndication signal the audit flagged (same title, same published
-- day, different sources). Add the published-day key for news (every news
-- search_documents row carries start_date = published date), matching the audit's
-- "cross-source same-title-same-day" criterion. Additive/behaviour-narrowing for
-- news only; event/festival/venue grouping is unchanged.

create or replace function public.find_duplicate_clusters(p_content_type text, p_limit integer default 100)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  with norm as (
    select entity_id, title, city, country, slug,
           lower(unaccent(btrim(coalesce(title,'')))) as nt,
           coalesce(lower(unaccent(btrim(city))), '')  as nc,
           case when p_content_type in ('event','festival','news') and start_date is not null
                then to_char((start_date at time zone 'UTC'), 'YYYY-MM-DD') else '' end as nd
    from public.search_documents
    where entity_type = p_content_type and title is not null and length(btrim(title)) >= 3
  ),
  groups as (
    select nt, nc, nd, count(*) as c,
           jsonb_agg(jsonb_build_object('id', entity_id, 'title', title, 'city', city,
                                        'country', country, 'slug', slug)
                     order by slug nulls last) as members
    from norm group by nt, nc, nd having count(*) > 1
  )
  select coalesce((
    select jsonb_agg(jsonb_build_object('normalized_title', nt, 'city', nullif(nc,''),
                                        'day', nullif(nd,''), 'count', c, 'members', members) order by c desc)
    from (select * from groups order by c desc, nt limit greatest(p_limit, 0)) x
  ), '[]'::jsonb);
$function$;
