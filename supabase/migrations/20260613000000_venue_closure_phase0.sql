-- Venue data-quality remediation — Phase 0 (2026-06-13)
--
-- Three repairs that make existing closure machinery actually function:
--
-- 1. detect_stale_venues() has FAILED on every cron run since it shipped with
--    `column reference "venue_id" is ambiguous` (the RETURNS TABLE OUT column
--    `venue_id` collided with the unqualified `venue_sources.venue_id` in the
--    GROUP BY). 0 venues were ever processed. Fixed by fully qualifying the
--    column. Behaviour also changed: staleness is a WEAK signal (a paused
--    source != a closed venue), so it now only sets needs_attention=true and
--    NEVER auto-closes. Auto-close lives in Phase 2's combined-signal engine.
--
-- 2. Closed venues were only -0.5 demoted in search_hybrid / search_facets, not
--    filtered — they could still surface. Add a hard `closed_at IS NULL` filter
--    to search_hybrid, search_facets and rpc_venues_ranked. (search_autocomplete
--    already filters closed_at.)
--
-- Idempotent: all CREATE OR REPLACE.

-- ---------------------------------------------------------------------------
-- 1. detect_stale_venues — fix ambiguity, flag-only (no auto-close)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_stale_venues(
  p_stale_after_days integer DEFAULT 60,
  p_dry_run boolean DEFAULT false
)
RETURNS TABLE(venue_id uuid, last_seen_at timestamptz)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH last_sources AS (
    SELECT vs.venue_id AS vid, MAX(vs.last_seen_at) AS max_seen
    FROM public.venue_sources vs
    GROUP BY vs.venue_id
  ),
  stale AS (
    SELECT v.id AS vid, ls.max_seen
    FROM public.venues v
    LEFT JOIN last_sources ls ON ls.vid = v.id
    WHERE v.closed_at IS NULL
      AND v.duplicate_of_id IS NULL
      AND coalesce(ls.max_seen, v.created_at) < now() - (p_stale_after_days || ' days')::interval
  ),
  flagged AS (
    UPDATE public.venues v
       SET needs_attention = true
      FROM stale s
     WHERE v.id = s.vid
       AND p_dry_run IS FALSE
       AND v.needs_attention IS DISTINCT FROM true
    RETURNING v.id
  )
  SELECT s.vid, s.max_seen FROM stale s;
END
$function$;

-- ---------------------------------------------------------------------------
-- 2a. search_hybrid — hard-exclude closed venues (added: sd.closed_at is null)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_hybrid(p_query text DEFAULT ''::text, p_query_vec vector DEFAULT NULL::vector, p_content_types text[] DEFAULT NULL::text[], p_filters jsonb DEFAULT '{}'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_km double precision DEFAULT NULL::double precision, p_now timestamp with time zone DEFAULT now(), p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_sort text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
with toks as (select regexp_split_to_array(lower(unaccent(coalesce(nullif(btrim(p_query),''),''))), '\s+') as arr),
qcity as (select cname from (select c.title cname,(select count(*) from public.search_documents v where v.entity_type='venue' and lower(v.city)=lower(c.title)) n from public.search_documents c, toks where c.entity_type='city' and c.title is not null and length(c.title)>=4 and lower(unaccent(c.title))=any(toks.arr)) z where z.n>=10 order by z.n desc limit 1),
params as (select nullif(btrim(p_query),'') q0, (select cname from qcity) dcity, case when p_lat is not null and p_lng is not null then st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography end origin),
p2 as (select q0,dcity,origin, lower(coalesce(p_filters->>'city',dcity)) boost_city, nullif(btrim(case when dcity is not null then regexp_replace(q0,dcity,'','gi') else q0 end),'') eff_q from params),
vnn as (select se.doc_id from public.search_embeddings se where p_query_vec is not null and se.embedding is not null order by se.embedding <=> p_query_vec limit 200),
kwvec as (
  select sd.doc_id from public.search_documents sd, p2 p
  where p.eff_q is not null and (sd.search_tsv @@ websearch_to_tsquery('simple',unaccent(p.eff_q)) or sd.title % p.eff_q)
  union
  select doc_id from vnn
),
cand as (
  select sd.doc_id, sd.entity_id, sd.entity_type, sd.title, sd.description, sd.facets, sd.city, sd.country, sd.slug, sd.image_url, sd.is_featured, sd.is_free, sd.price_min, sd.price_max, sd.start_date, sd.end_date, sd.trust_score, sd.liveness_status, sd.geog, sd.quality_score, sd.closed_at, sd.lgbtq_score, p.boost_city,
    case when p.eff_q is not null then ts_rank_cd(sd.search_tsv, websearch_to_tsquery('simple',unaccent(p.eff_q))) else 0 end kw_rank,
    case when p.eff_q is not null then similarity(coalesce(sd.title,''),p.eff_q) else 0 end trg,
    case when p_query_vec is not null and emb.embedding is not null then 1-(emb.embedding <=> p_query_vec) else null end vec_sim,
    case when p.origin is not null and sd.geog is not null then st_distance(sd.geog,p.origin) else null end dist_m
  from public.search_documents sd cross join p2 p
    left join lateral (select se.embedding from public.search_embeddings se where p_query_vec is not null and se.doc_id=sd.doc_id) emb on true
  where (p_content_types is null or sd.entity_type=any(p_content_types))
    and sd.closed_at is null
    and (not (p_filters ? 'city') or lower(sd.city)=lower(p_filters->>'city'))
    and (not (p_filters ? 'country') or lower(sd.country)=lower(p_filters->>'country'))
    and (not (p_filters ? 'category') or lower(sd.facets->>'category')=lower(p_filters->>'category'))
    and (not (p_filters ? 'is_featured') or sd.is_featured=(p_filters->>'is_featured')::boolean)
    and (not (p_filters ? 'is_free') or sd.is_free=(p_filters->>'is_free')::boolean)
    and (not (p_filters ? 'target_groups')
         or (jsonb_typeof(sd.facets->'target_groups')='array'
             and (sd.facets->'target_groups') ?| array(select jsonb_array_elements_text(p_filters->'target_groups'))))
    and (p_date_from is null or (sd.start_date is not null and coalesce(sd.end_date,sd.start_date) >= p_date_from))
    and (p_date_to   is null or (sd.start_date is not null and sd.start_date <= p_date_to))
    and (p_price_min is null or coalesce(sd.price_max,sd.price_min) >= p_price_min)
    and (p_price_max is null or coalesce(sd.price_min,sd.price_max) <= p_price_max)
    and (p.origin is null or (sd.geog is not null and st_dwithin(sd.geog,p.origin,p_radius_km*1000)))
    and (sd.entity_type<>'event' or sd.start_date is null or coalesce(sd.end_date,sd.start_date)>=p_now-interval '1 day')
    and (
      (p.eff_q is null and p.boost_city is null)
      or (p.eff_q is null and p.boost_city is not null and lower(sd.city)=p.boost_city)
      or (p.eff_q is not null and sd.doc_id in (select doc_id from kwvec))
    )
),
kw as (select doc_id, rank() over (order by greatest(kw_rank,trg) desc) rk from cand where greatest(kw_rank,trg)>0),
vec as (select doc_id, rank() over (order by vec_sim desc) rk from cand where vec_sim is not null),
fused as (select c.*, coalesce(1.0/(60+kw.rk),0)+coalesce(1.0/(60+vec.rk),0) rrf from cand c left join kw using(doc_id) left join vec using(doc_id)),
scored as (select f.*, f.rrf
   + 0.06 * case when f.entity_type='venue' then coalesce(f.lgbtq_score, 0.5) else 1.0 end
   + case f.entity_type when 'venue' then 0.015 when 'queer_village' then 0.012 when 'event' then 0.010 when 'personality' then 0.010 when 'city' then 0.006 when 'country' then 0.004 when 'marketplace' then 0.004 when 'news' then -0.010 when 'tag' then -0.006 else 0 end
   + case when f.boost_city is not null and lower(f.city)=f.boost_city then 0.05 else 0 end
   + case when f.is_featured then 0.02 else 0 end
   + case when f.liveness_status in ('dead','cancelled','dead_link','sold_out') then -0.5 when f.liveness_status='live' then 0.01 else 0 end
   + case when f.closed_at is not null then -0.5 else 0 end
   + case when f.entity_type='event' and f.start_date is not null and f.start_date>=p_now then 0.03*exp(-extract(epoch from (f.start_date-p_now))/(60*60*24*30)) else 0 end
   - case when f.dist_m is not null then least(f.dist_m/50000.0,1)*0.02 else 0 end as score from fused f)
select jsonb_build_object('total',(select count(*) from cand),'hits',coalesce((select jsonb_agg(h) from (
  select jsonb_build_object('objectID',entity_id,'doc_id',doc_id,'type',entity_type,'title',title,'description',left(description,300),'category',facets->>'category','city',city,'country',country,'location',nullif(concat_ws(', ',city,country),''),'slug',slug,'imageUrl',image_url,'featured',is_featured,'is_free',is_free,'price_min',price_min,'price_max',price_max,'start_date',extract(epoch from start_date),'end_date',extract(epoch from end_date),'trust_score',trust_score,'liveness_status',liveness_status,'_geoloc',case when geog is not null then jsonb_build_object('lat',st_y(geog::geometry),'lng',st_x(geog::geometry)) end,'_distance_m',case when dist_m is not null then round(dist_m)::int end,'_rankingScore',round(score::numeric,6),'tags',facets->'tags') h
  from scored
  order by
    case when p_sort='date_asc'   then extract(epoch from start_date) end asc  nulls last,
    case when p_sort='date_desc'  then extract(epoch from start_date) end desc nulls last,
    case when p_sort='price_asc'  then price_min end                     asc  nulls last,
    case when p_sort='price_desc' then coalesce(price_max,price_min) end desc nulls last,
    case when p_sort='distance'   then dist_m end                        asc  nulls last,
    case when p_sort='trust'      then trust_score end                   desc nulls last,
    score desc, quality_score desc nulls last
  limit greatest(p_limit,0) offset greatest(p_offset,0)
) x),'[]'::jsonb))
$function$;

-- ---------------------------------------------------------------------------
-- 2b. search_facets — hard-exclude closed venues (added: sd.closed_at is null)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_facets(p_query text DEFAULT ''::text, p_content_types text[] DEFAULT NULL::text[], p_filters jsonb DEFAULT '{}'::jsonb, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_km double precision DEFAULT NULL::double precision, p_now timestamp with time zone DEFAULT now())
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
match as (
  select sd.doc_id from public.search_documents sd, params p
  where p.q is not null and (sd.search_tsv @@ websearch_to_tsquery('simple', unaccent(p.q)) or sd.title % p.q)
),
cand as (
  select sd.entity_type, sd.city, sd.country, sd.facets,
         sd.price_min, sd.price_max, sd.is_free, sd.start_date
  from public.search_documents sd, params p
  where (p_content_types is null or sd.entity_type = any(p_content_types))
    and sd.closed_at is null
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

-- ---------------------------------------------------------------------------
-- 2c. rpc_venues_ranked — hard-exclude closed venues (count CTE + base CTE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_venues_ranked(p_user_id uuid DEFAULT NULL::uuid, p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric, p_filters jsonb DEFAULT '{}'::jsonb, p_sort text DEFAULT 'relevance'::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS TABLE(venue jsonb, score numeric, distance_m numeric, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_prefs_categories  text[] := COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(discovery_profile -> 'categories'))
       FROM public.profiles WHERE user_id = p_user_id),
    ARRAY[]::text[]);
  v_prefs_tags        text[] := COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(discovery_profile -> 'tags'))
       FROM public.profiles WHERE user_id = p_user_id),
    ARRAY[]::text[]);
  v_prefs_groups      text[] := COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(discovery_profile -> 'target_groups'))
       FROM public.profiles WHERE user_id = p_user_id),
    ARRAY[]::text[]);
  v_behavior_cats     text[] := CASE WHEN p_user_id IS NULL THEN ARRAY[]::text[] ELSE COALESCE(
    (SELECT ARRAY_AGG(category)
       FROM (
         SELECT v.category, COUNT(*) AS n
           FROM public.venue_checkins c JOIN public.venues v ON v.id = c.venue_id
          WHERE c.user_id = p_user_id AND v.category IS NOT NULL
          GROUP BY v.category HAVING COUNT(*) >= 3
       ) t),
    ARRAY[]::text[]) END;

  v_q                 text := NULLIF(p_filters->>'search', '');
  v_category          text := NULLIF(p_filters->>'category', '');
  v_city              text := NULLIF(p_filters->>'city', '');
  v_radius_km         numeric := NULLIF(p_filters->>'radiusKm', '')::numeric;
  v_price             int     := NULLIF(p_filters->>'priceLevel', '')::int;
  v_tags              text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'tags')), ARRAY[]::text[]);
  v_amenities         text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'amenities')), ARRAY[]::text[]);
  v_services          text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'services')), ARRAY[]::text[]);
  v_access            text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'accessibility')), ARRAY[]::text[]);
  v_groups            text[]  := COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_filters -> 'groups')), ARRAY[]::text[]);

  v_w_distance        numeric := CASE WHEN p_user_id IS NULL THEN 0.55 ELSE 0.35 END;
  v_w_interest        numeric := CASE WHEN p_user_id IS NULL THEN 0.0  ELSE 0.25 END;
  v_w_behavior        numeric := CASE WHEN p_user_id IS NULL THEN 0.0  ELSE 0.15 END;
  v_w_quality         numeric := CASE WHEN p_user_id IS NULL THEN 0.30 ELSE 0.15 END;
  v_w_recency         numeric := 0.10;

  v_total             bigint;
BEGIN
  -- Cheap filtered count first. No scoring, no distance compute.
  SELECT COUNT(*) INTO v_total
    FROM public.venues v
   WHERE v.data_source IS DISTINCT FROM 'refuge-restrooms'
     AND v.duplicate_of_id IS NULL
     AND v.closed_at IS NULL
     AND (v_q IS NULL OR
          v.name ILIKE '%' || v_q || '%' OR
          COALESCE(v.description, '') ILIKE '%' || v_q || '%' OR
          COALESCE(v.address, '') ILIKE '%' || v_q || '%')
     AND (v_category IS NULL OR v.category = v_category)
     AND (v_city IS NULL OR v.city ILIKE '%' || v_city || '%')
     AND (array_length(v_tags, 1) IS NULL OR v.tags && v_tags)
     AND (array_length(v_amenities, 1) IS NULL OR v.amenities && v_amenities)
     AND (array_length(v_services, 1) IS NULL OR v.services && v_services)
     AND (array_length(v_access, 1) IS NULL OR v.accessibility_attributes && v_access)
     AND (array_length(v_groups, 1) IS NULL OR v.target_groups && v_groups)
     AND (v_price IS NULL OR v.price_range = v_price);

  RETURN QUERY
  WITH base AS (
    SELECT v.*,
           (CASE
             WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL
              AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
               6371000 * 2 * ASIN(SQRT(
                 POWER(SIN(RADIANS((v.latitude - p_lat) / 2)), 2) +
                 COS(RADIANS(p_lat)) * COS(RADIANS(v.latitude)) *
                 POWER(SIN(RADIANS((v.longitude - p_lng) / 2)), 2)
               ))
             ELSE NULL
           END)::numeric AS dist_m
      FROM public.venues v
     WHERE v.data_source IS DISTINCT FROM 'refuge-restrooms'
       AND v.duplicate_of_id IS NULL
       AND v.closed_at IS NULL
       AND (v_q IS NULL OR
            v.name ILIKE '%' || v_q || '%' OR
            COALESCE(v.description, '') ILIKE '%' || v_q || '%' OR
            COALESCE(v.address, '') ILIKE '%' || v_q || '%')
       AND (v_category IS NULL OR v.category = v_category)
       AND (v_city IS NULL OR v.city ILIKE '%' || v_city || '%')
       AND (array_length(v_tags, 1) IS NULL OR v.tags && v_tags)
       AND (array_length(v_amenities, 1) IS NULL OR v.amenities && v_amenities)
       AND (array_length(v_services, 1) IS NULL OR v.services && v_services)
       AND (array_length(v_access, 1) IS NULL OR v.accessibility_attributes && v_access)
       AND (array_length(v_groups, 1) IS NULL OR v.target_groups && v_groups)
       AND (v_price IS NULL OR v.price_range = v_price)
  ),
  filtered AS (
    SELECT b.* FROM base b
     WHERE (v_radius_km IS NULL OR b.dist_m IS NULL OR b.dist_m <= v_radius_km * 1000)
  ),
  scored AS (
    SELECT
      f.*,
      (CASE WHEN f.dist_m IS NULL THEN 0.3 ELSE EXP(- POWER(f.dist_m / 30000.0, 2)) END)::numeric AS s_distance,
      LEAST(1.0::numeric,
        (CASE WHEN array_length(v_prefs_categories, 1) > 0 AND f.category = ANY(v_prefs_categories) THEN 0.5 ELSE 0 END)::numeric
      + (CASE WHEN array_length(v_prefs_tags, 1) > 0 AND f.tags && v_prefs_tags THEN 0.3 ELSE 0 END)::numeric
      + (CASE WHEN array_length(v_prefs_groups, 1) > 0 AND f.target_groups && v_prefs_groups THEN 0.2 ELSE 0 END)::numeric
      ) AS s_interest,
      (CASE WHEN array_length(v_behavior_cats, 1) > 0 AND f.category = ANY(v_behavior_cats) THEN 1.0 ELSE 0.0 END)::numeric AS s_behavior,
      LEAST(1.0::numeric,
        (CASE WHEN f.is_featured THEN 0.5 ELSE 0 END)::numeric
      + (CASE WHEN f.verified THEN 0.3 ELSE 0 END)::numeric
      + 0.2::numeric
      ) AS s_quality,
      GREATEST(0.0::numeric, 1.0::numeric - (LN(GREATEST(1, EXTRACT(DAY FROM (now() - f.created_at))::int)) / LN(365))::numeric) AS s_recency
      FROM filtered f
  ),
  ranked AS (
    SELECT
      s.*,
      ( v_w_distance * s.s_distance
      + v_w_interest * s.s_interest
      + v_w_behavior * s.s_behavior
      + v_w_quality  * s.s_quality
      + v_w_recency  * s.s_recency )::numeric AS relevance
      FROM scored s
  )
  SELECT
    to_jsonb(r) - 's_distance' - 's_interest' - 's_behavior'
                - 's_quality' - 's_recency' - 'relevance' - 'dist_m' AS venue,
    r.relevance,
    r.dist_m,
    v_total AS total
    FROM ranked r
   ORDER BY
     CASE WHEN p_sort = 'name'       THEN r.name      END ASC NULLS LAST,
     CASE WHEN p_sort = 'category'   THEN r.category  END ASC NULLS LAST,
     CASE WHEN p_sort = 'city'       THEN r.city      END ASC NULLS LAST,
     CASE WHEN p_sort = 'created_at' THEN r.created_at END DESC NULLS LAST,
     CASE WHEN p_sort = 'featured'   THEN r.is_featured::int END DESC,
     CASE WHEN p_sort = 'nearest'    THEN r.dist_m    END ASC NULLS LAST,
     CASE WHEN p_sort = 'relevance'  THEN r.relevance END DESC NULLS LAST,
     r.relevance DESC NULLS LAST,
     r.id ASC
   LIMIT p_limit OFFSET p_offset;
END
$function$;
