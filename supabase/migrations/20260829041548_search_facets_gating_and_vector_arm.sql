-- search_facets: count the SAME candidate set search_hybrid ranks.
--
-- It had diverged in three ways, and one of them defeated the safety layer.
--
-- 1. SAFETY — the reason this is not a cosmetic fix.
--    `search_facets` had no `safety_gated` filter and never read
--    `p_filters.include_gated`, while `search_hybrid` has honoured both since
--    20260623160001. So for an ANONYMOUS request the hits were correctly withheld
--    and the facet block described them anyway. Measured on prod, anon,
--    filters {"city":"Cairo"}:
--
--        totalHits: 1                      <- the 80 gated venues correctly withheld
--        facets:  type     venue 80, city 1
--                 city     Cairo 81
--                 category other 18, restaurant 18, cafe 17, bar 10, shop 5,
--                          hotel 4, gallery 4, sauna 3, club 1
--                 tags     sauna 2, men-only 1, male-only 1, cairo-nightlife 1,
--                          zamalek-bar 1, …
--
--    Egypt is a criminalising destination. That is a per-category, per-tag profile
--    of its LGBTQ+ venues handed to an unauthenticated caller — including which
--    are saunas and which are men-only. The ONLY sanctioned anon exposure of gated
--    content is `gated_count_for_location`, which returns a BARE COUNT for the
--    "Sign in to view N places" notice; counts only, never a breakdown. 1,489 of
--    118,320 indexed docs are gated.
--
--    After: anon type facet is {"city":1}; with include_gated it is
--    {"city":1,"venue":80} — identical to what search_hybrid admits either way.
--
-- 2. `closed_at` was not filtered either. Currently 0 such rows in
--    search_documents, so this changes nothing today. It is added to keep the two
--    candidate sets identical BY CONSTRUCTION rather than by luck — drifting apart
--    quietly is exactly how (1) happened.
--
-- 3. The vector arm was missing, so facets counted a SMALLER set than `total`.
--    `search_facets` took no p_query_vec at all, so it was structurally
--    keyword-only while `search_hybrid.total` counts keyword UNION vnn(top-200).
--    Measured before: q="fentanyl test strips" totalHits 45 / facets summed 26;
--    q="berghain" 66 / 26. After, on five queries, facet sum == hybrid total
--    exactly: 66/66, 44/44, 66/66, 433/433, 234/234.
--
--    Note (1) and (3) push in OPPOSITE directions — facets over-counted gated rows
--    while under-counting semantic ones — so the error never showed up as a simple
--    constant offset that anyone would have spotted by eye.
--
-- COST: the extra HNSW top-200 probe measured +1-2 ms (pride 349->350,
-- leather bar 268->269, fentanyl test strips 162->164, min-of-4). search_facets
-- already runs in parallel with search_hybrid in the worker, so this is not on the
-- critical path twice.
--
-- WHY DROP, NOT REPLACE: adding a defaulted parameter creates an OVERLOAD rather
-- than replacing the function, and PostgREST then fails with "Could not choose the
-- best candidate function" because both signatures match the worker's named args.
-- The drop is safe in EITHER deploy order — every parameter is defaulted, so a
-- worker that does not yet send p_query_vec still resolves and simply gets
-- keyword-only facets. The gating fix therefore lands with this migration alone,
-- independent of the worker rollout.
--
-- Grants mirror 20260623160003: revoked from anon/public, granted to authenticated
-- and service_role. The worker uses the service key and sets include_gated only
-- after verifying the caller's Supabase JWT.

drop function if exists public.search_facets(text, text[], jsonb, double precision, double precision, double precision, timestamptz);

CREATE OR REPLACE FUNCTION public.search_facets(p_query text DEFAULT ''::text, p_content_types text[] DEFAULT NULL::text[], p_filters jsonb DEFAULT '{}'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_km double precision DEFAULT NULL::double precision, p_now timestamp with time zone DEFAULT now(), p_query_vec vector DEFAULT NULL::vector)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
with params as (
  select nullif(btrim(p_query),'') as q,
         case when p_lat is not null and p_lng is not null
              then st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end as origin
),
vnn as (
  select se.doc_id from public.search_embeddings se
  where p_query_vec is not null and se.embedding is not null
  order by se.embedding <=> p_query_vec limit 200
),
match as (
  select sd.doc_id from public.search_documents sd, params p
  where p.q is not null and (sd.search_tsv @@ websearch_to_tsquery('simple', unaccent(p.q)) or sd.title % p.q)
  union
  select doc_id from vnn
),
cand as (
  select sd.entity_type, sd.city, sd.country, sd.facets,
         sd.price_min, sd.price_max, sd.is_free, sd.start_date
  from public.search_documents sd, params p
  where (p_content_types is null or sd.entity_type = any(p_content_types))
    and sd.closed_at is null
    and (coalesce((p_filters->>'include_gated')::boolean, false) or not sd.safety_gated)
    and (not (p_filters ? 'city')        or lower(sd.city)    = lower(p_filters->>'city'))
    and (not (p_filters ? 'country')     or lower(sd.country) = lower(p_filters->>'country'))
    and (not (p_filters ? 'category')    or lower(sd.facets->>'category') = lower(p_filters->>'category'))
    and (not (p_filters ? 'is_featured') or sd.is_featured = (p_filters->>'is_featured')::boolean)
    and (not (p_filters ? 'is_free')     or sd.is_free     = (p_filters->>'is_free')::boolean)
    and (not (p_filters ? 'target_groups')
         or (jsonb_typeof(sd.facets->'target_groups') = 'array'
             and (sd.facets->'target_groups') ?| array(select jsonb_array_elements_text(p_filters->'target_groups'))))
    and (not (p_filters ? 'tags')
         or (jsonb_typeof(sd.facets->'tags') = 'array'
             and (sd.facets->'tags') ?| array(select jsonb_array_elements_text(p_filters->'tags'))))
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
  'tags',     (select jsonb_object_agg(k, c) from (
                 select tg as k, count(*) c
                 from cand, lateral jsonb_array_elements_text(
                        case when jsonb_typeof(facets->'tags')='array' then facets->'tags' else '[]'::jsonb end) tg
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

revoke execute on function public.search_facets(text, text[], jsonb, double precision, double precision, double precision, timestamptz, vector) from public, anon;
grant  execute on function public.search_facets(text, text[], jsonb, double precision, double precision, double precision, timestamptz, vector) to authenticated, service_role;
