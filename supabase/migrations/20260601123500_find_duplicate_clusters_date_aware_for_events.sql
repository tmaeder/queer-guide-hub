-- Make find_duplicate_clusters date-aware for time-bound entity types.
--
-- It grouped purely by normalized title + city. For events/festivals that's
-- unsafe: a recurring series (e.g. "World Naked Bike Ride San Francisco", one
-- instance per year) shares a title+city across decades, so the RPC surfaced it
-- as a single 64-member "duplicate cluster". Any event-merge surface built on
-- that would catastrophically collapse distinct historical/future events into
-- one. (Measured: 0 genuine same-day event duplicates, yet 327 false clusters.)
--
-- For event/festival the grouping now also keys on the UTC start day, so only
-- true same-day duplicates cluster (event clusters 327 -> 0). Non-time-bound
-- types (venue/city/personality/marketplace) are unchanged — nd is always ''
-- (venue clusters stay 153). A 'day' field is added to time-bound clusters.
create or replace function public.find_duplicate_clusters(p_content_type text, p_limit integer default 100)
 returns jsonb language sql stable security definer set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  with norm as (
    select entity_id, title, city, country, slug,
           lower(unaccent(btrim(coalesce(title,'')))) as nt,
           coalesce(lower(unaccent(btrim(city))), '')  as nc,
           case when p_content_type in ('event','festival') and start_date is not null
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
