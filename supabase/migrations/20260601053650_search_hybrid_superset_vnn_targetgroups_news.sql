-- Reconcile search_hybrid: a single superset of the three divergent definitions.
--
-- Three changes to search_hybrid landed close together and diverged:
--   1. news-recency decay scoring (#1378, 20260531205557)
--   2. target_groups any-of filter (#1382, 20260601035704)
--   3. vector-overadmit fix — vnn top-200 KNN (#1384, applied live as 20260601052824)
--
-- The vnn fix was authored against a pre-(1)/(2) base, so when it was applied
-- last on live it silently dropped BOTH the target_groups filter and the
-- news-recency decay from production. Meanwhile repo `main` (latest-timestamp =
-- target_groups) carried (1)+(2) but reintroduced the over-admit bug. Neither
-- side was a clean superset.
--
-- This is the authoritative latest definition and folds all three together:
-- vnn top-200 semantic admission + target_groups filter + news recency decay.
-- It supersedes #1384 (whose 20260601000000 file would otherwise be overwritten
-- by target_groups on replay). Mirrors the SQL applied to xqeacpakadqfxjxjcewc.
--
-- Validated on live: berlin total 794; queryless target_groups filter
-- lesbian→12 venues, trans+non-binary→13 (matches #1382 facet counts);
-- over-admit clause gone; latency back to ~730ms on universal vector queries.
create or replace function public.search_hybrid(
  p_query text default ''::text, p_query_vec extensions.vector default null::vector,
  p_content_types text[] default null::text[], p_filters jsonb default '{}'::jsonb,
  p_lat double precision default null, p_lng double precision default null,
  p_radius_km double precision default null, p_now timestamp with time zone default now(),
  p_limit integer default 20, p_offset integer default 0)
 returns jsonb language sql stable security definer set search_path to 'public', 'extensions', 'pg_temp'
as $function$
with params as (
  select nullif(btrim(p_query),'') as q,
         case when p_lat is not null and p_lng is not null
              then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as origin
),
-- Bound semantic admission to the indexed top-200 nearest neighbours (HNSW)
-- instead of admitting the whole corpus when p_query_vec is non-null.
vnn as (
  select doc_id from public.search_documents
  where p_query_vec is not null and embedding is not null
  order by embedding <=> p_query_vec
  limit 200
),
cand as (
  select sd.*,
    case when p.q is not null then ts_rank_cd(sd.search_tsv, websearch_to_tsquery('simple', unaccent(p.q))) else 0 end as kw_rank,
    case when p.q is not null then similarity(coalesce(sd.title,''), p.q) else 0 end as trg,
    case when p_query_vec is not null and sd.embedding is not null then 1 - (sd.embedding <=> p_query_vec) else null end as vec_sim,
    case when p.origin is not null and sd.geog is not null then st_distance(sd.geog, p.origin) else null end as dist_m
  from public.search_documents sd, params p
  where (p_content_types is null or sd.entity_type = any(p_content_types))
    and (not (p_filters ? 'city')        or lower(sd.city)    = lower(p_filters->>'city'))
    and (not (p_filters ? 'country')     or lower(sd.country) = lower(p_filters->>'country'))
    and (not (p_filters ? 'category')    or lower(sd.facets->>'category') = lower(p_filters->>'category'))
    and (not (p_filters ? 'is_featured') or sd.is_featured = (p_filters->>'is_featured')::boolean)
    and (not (p_filters ? 'is_free')     or sd.is_free     = (p_filters->>'is_free')::boolean)
    and (not (p_filters ? 'target_groups')
         or (jsonb_typeof(sd.facets->'target_groups') = 'array'
             and (sd.facets->'target_groups') ?| array(select jsonb_array_elements_text(p_filters->'target_groups'))))
    and (p.origin is null or (sd.geog is not null and st_dwithin(sd.geog, p.origin, p_radius_km*1000)))
    and (sd.entity_type <> 'event' or sd.start_date is null or coalesce(sd.end_date, sd.start_date) >= p_now - interval '1 day')
    and (p.q is null
         or sd.search_tsv @@ websearch_to_tsquery('simple', unaccent(p.q))
         or similarity(coalesce(sd.title,''), p.q) > 0.2
         or sd.doc_id in (select doc_id from vnn))
),
kw  as (select doc_id, rank() over (order by greatest(kw_rank, trg) desc) rk from cand where greatest(kw_rank, trg) > 0),
vec as (select doc_id, rank() over (order by vec_sim desc) rk from cand where vec_sim is not null),
fused as (
  select c.*, coalesce(1.0/(60+kw.rk), 0) + coalesce(1.0/(60+vec.rk), 0) as rrf
  from cand c left join kw using (doc_id) left join vec using (doc_id)
),
scored as (
  select f.*,
    f.rrf
    + case when f.is_featured then 0.02 else 0 end
    + case when f.liveness_status in ('dead','cancelled','dead_link','sold_out') then -0.5
           when f.liveness_status = 'live' then 0.01 else 0 end
    + case when f.closed_at is not null then -0.5 else 0 end
    + case when f.entity_type='event' and f.start_date is not null and f.start_date >= p_now
           then 0.03 * exp(-extract(epoch from (f.start_date - p_now)) / (60*60*24*30)) else 0 end
    + case when f.entity_type='news' and f.start_date is not null
           then 0.05 * exp(-extract(epoch from (p_now - f.start_date)) / (60*60*24*30)) else 0 end
    - case when f.dist_m is not null then least(f.dist_m/50000.0, 1) * 0.02 else 0 end
    as score
  from fused f
)
select jsonb_build_object(
  'total', (select count(*) from cand),
  'hits', coalesce((
    select jsonb_agg(h)
    from (
      select jsonb_build_object(
        'objectID', entity_id, 'doc_id', doc_id, 'type', entity_type,
        'title', title, 'description', left(description, 300),
        'category', facets->>'category', 'city', city, 'country', country,
        'location', nullif(concat_ws(', ', city, country), ''),
        'slug', slug, 'imageUrl', image_url, 'featured', is_featured,
        'is_free', is_free, 'price_min', price_min, 'price_max', price_max,
        'start_date', extract(epoch from start_date), 'end_date', extract(epoch from end_date),
        'trust_score', trust_score, 'liveness_status', liveness_status,
        '_geoloc', case when geog is not null then jsonb_build_object('lat', st_y(geog::geometry), 'lng', st_x(geog::geometry)) end,
        '_distance_m', case when dist_m is not null then round(dist_m)::int end,
        '_rankingScore', round(score::numeric, 6), 'tags', facets->'tags'
      ) as h
      from scored
      order by score desc, quality_score desc nulls last
      limit greatest(p_limit, 0) offset greatest(p_offset, 0)
    ) x
  ), '[]'::jsonb)
)
$function$;
