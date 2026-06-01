-- Perf: search_facets ran ~745ms as a function even though the identical body
-- runs in ~104ms inline. As a parameterized `language sql` function the cached
-- generic plan can't estimate the `tsv @@ … or title % p.q` selectivity and
-- seq-scans the whole table. The worker runs search_facets in PARALLEL with
-- search_hybrid on every /search, so /search latency was bounded by this (~745ms).
--
-- Same fix as search_hybrid: gather the keyword/trigram match doc_ids in a
-- `match` CTE (index-backed FTS + `title % q` bitmap), then admit candidates by
-- membership. Facets output is unchanged (same candidate set). 'gay bar'
-- 745ms -> ~244ms; /search now bounded ~325ms (search_hybrid), under the gate.
create or replace function public.search_facets(p_query text default ''::text, p_content_types text[] default null::text[], p_filters jsonb default '{}'::jsonb, p_lat double precision default null::double precision, p_lng double precision default null::double precision, p_radius_km double precision default null::double precision, p_now timestamp with time zone default now())
 returns jsonb language sql stable security definer set search_path to 'public', 'extensions', 'pg_temp'
as $function$
with params as (
  select nullif(btrim(p_query),'') as q,
         case when p_lat is not null and p_lng is not null
              then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as origin
),
match as (
  select sd.doc_id from public.search_documents sd, params p
  where p.q is not null and (sd.search_tsv @@ websearch_to_tsquery('simple', unaccent(p.q)) or sd.title % p.q)
),
cand as (
  select sd.entity_type, sd.city, sd.country, sd.facets,
         sd.price_min, sd.price_max, sd.is_free, sd.start_date
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
    and (p.q is null or sd.doc_id in (select doc_id from match))
)
select jsonb_strip_nulls(jsonb_build_object(
  'type',     (select jsonb_object_agg(entity_type, c) from (select entity_type, count(*) c from cand group by 1) t),
  'category', (select jsonb_object_agg(k, c) from (select facets->>'category' k, count(*) c from cand where facets ? 'category' group by 1 order by c desc limit 50) t),
  'city',     (select jsonb_object_agg(k, c) from (select city k, count(*) c from cand where city is not null group by 1 order by c desc limit 50) t),
  'country',  (select jsonb_object_agg(k, c) from (select country k, count(*) c from cand where country is not null group by 1 order by c desc limit 50) t),
  'target_groups', (select jsonb_object_agg(k, c) from (
                 select tg as k, count(*) c
                 from cand, lateral jsonb_array_elements_text(
                        case when jsonb_typeof(facets->'target_groups')='array' then facets->'target_groups' else '[]'::jsonb end) tg
                 group by tg order by c desc limit 50) t),
  'price',    (select case when count(price_min) = 0 then null else jsonb_build_object(
                 'min', min(price_min), 'max', max(coalesce(price_max, price_min)),
                 'free_count', count(*) filter (where is_free is true),
                 'bands', jsonb_build_object(
                   '0-10',   count(*) filter (where price_min >= 0   and price_min < 10),
                   '10-25',  count(*) filter (where price_min >= 10  and price_min < 25),
                   '25-50',  count(*) filter (where price_min >= 25  and price_min < 50),
                   '50-100', count(*) filter (where price_min >= 50  and price_min < 100),
                   '100+',   count(*) filter (where price_min >= 100)
                 )) end
               from cand where price_min is not null),
  'date',     (select jsonb_object_agg(m, c) from (
                 select to_char(date_trunc('month', start_date), 'YYYY-MM') m, count(*) c
                 from cand where entity_type = 'event' and start_date is not null and start_date >= p_now
                 group by 1 order by 1 limit 12) t)
))
$function$;
