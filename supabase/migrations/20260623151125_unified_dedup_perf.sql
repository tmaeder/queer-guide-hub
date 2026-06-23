-- Dedup name-keys — performance fix (2026-06-23)
--
-- find_fuzzy_duplicate_clusters / run_venue_fuzzy_automerge timed out at scale:
--   * subset_pairs cross-joined a ~110 m bucket then did array containment — drop it
--     (low value: word-order/typo cases are already caught by despaced/core keys).
--   * geo_pairs bucketed at round(coord,2) (~1 km) → huge dense-city buckets — tighten
--     to round(coord,3) (~110 m): far fewer candidate pairs, same "same-spot" intent.
--   * run_venue_fuzzy_automerge.key_pairs joined on city_id ALONE (a full city cross
--     product) then filtered the key in WHERE — rewrite as dsp/core EQUI-joins so only
--     key-identical rows pair up before the haversine check.
-- Pure CREATE OR REPLACE, behaviour-preserving except the dropped subset tier.

CREATE OR REPLACE FUNCTION public.find_fuzzy_duplicate_clusters(
  p_limit integer DEFAULT 200, p_min_name_sim numeric DEFAULT 0.80)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp' AS $function$
with live as (
  select id, name, name_normalized nn, slug, city, country, city_id,
         latitude lat, longitude lng,
         round(latitude::numeric, 3) c3lat, round(longitude::numeric, 3) c3lng,
         public.dedup_despace(name) dsp, public.dedup_core_tokens(name, city) core,
         quality_score, is_featured
  from public.venues
  where duplicate_of_id is null and closed_at is null
    and review_status is distinct from 'archived'
    and data_source is distinct from 'refuge-restrooms'
    and name_normalized is not null and length(name_normalized) >= 3
),
-- near-identical names at effectively the same coordinates (~110 m bucket)
geo_pairs as (
  select a.id aid, b.id bid, extensions.similarity(a.nn, b.nn)::numeric name_sim,
         public.haversine_m(a.lat, a.lng, b.lat, b.lng) dist, 'geo_name'::text mt
  from live a join live b
    on a.c3lat = b.c3lat and a.c3lng = b.c3lng and a.id < b.id
   and a.lat is not null and b.lat is not null
  where extensions.similarity(a.nn, b.nn) >= p_min_name_sim
),
-- same-city trigram for rows lacking coordinates
city_pairs as (
  select a.id aid, b.id bid, extensions.similarity(a.nn, b.nn)::numeric name_sim,
         null::double precision dist, 'city_name'::text mt
  from live a join live b
    on a.city_id is not distinct from b.city_id and a.city_id is not null and a.id < b.id
   and a.nn % b.nn
  where (a.lat is null or b.lat is null)
    and extensions.similarity(a.nn, b.nn) >= greatest(p_min_name_sim, 0.88)
),
-- identical de-spaced name within the same city (Laboratory / Lab.Oratory)
despace_pairs as (
  select a.id aid, b.id bid, 0.97::numeric name_sim,
         public.haversine_m(a.lat, a.lng, b.lat, b.lng) dist, 'despaced'::text mt
  from live a join live b
    on a.city_id = b.city_id and a.id < b.id and a.dsp = b.dsp
  where length(a.dsp) >= 4
),
-- identical significant tokens within the same city (Boiler / BOILER Sauna Berlin)
core_pairs as (
  select a.id aid, b.id bid, 0.93::numeric name_sim,
         public.haversine_m(a.lat, a.lng, b.lat, b.lng) dist, 'core_tokens'::text mt
  from live a join live b
    on a.city_id = b.city_id and a.id < b.id and a.core = b.core
  where cardinality(a.core) >= 1 and a.dsp <> b.dsp
),
edges as (
  select aid, bid, max(name_sim) name_sim, min(dist) dist,
         (array_agg(mt order by name_sim desc, dist asc nulls last))[1] mt
  from (select * from geo_pairs union all select * from city_pairs
        union all select * from despace_pairs union all select * from core_pairs) u
  group by aid, bid
),
ranked as (
  select e.*,
    ((e.mt in ('despaced','core_tokens') and e.dist is not null and e.dist < 150)
     or (e.mt = 'geo_name' and e.name_sim >= 0.92 and e.dist is not null and e.dist < 100)) as auto_eligible
  from edges e
  order by auto_eligible desc, name_sim desc, dist asc nulls last
  limit greatest(p_limit, 0)
)
select coalesce(jsonb_agg(jsonb_build_object(
  'score', round(r.name_sim, 3),
  'match_type', r.mt,
  'dist_m', case when r.dist is not null then round(r.dist)::int end,
  'auto_eligible', r.auto_eligible,
  'count', 2,
  'members', jsonb_build_array(
    jsonb_build_object('id', a.id, 'title', a.name, 'slug', a.slug, 'city', a.city, 'country', a.country, 'quality_score', a.quality_score, 'is_featured', a.is_featured),
    jsonb_build_object('id', b.id, 'title', b.name, 'slug', b.slug, 'city', b.city, 'country', b.country, 'quality_score', b.quality_score, 'is_featured', b.is_featured)
  )
) order by r.auto_eligible desc, r.name_sim desc), '[]'::jsonb)
from ranked r
join live a on a.id = r.aid
join live b on b.id = r.bid;
$function$;

CREATE OR REPLACE FUNCTION public.run_venue_fuzzy_automerge(
  p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 1000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp' AS $function$
declare
  r record; v_keep uuid; v_drop uuid;
  v_merged int := 0; v_skipped int := 0; v_eligible int := 0; v_chains int := 0;
begin
  perform public.assert_admin_or_internal();
  for r in
    with live as (
      select id, name_normalized nn, latitude lat, longitude lng, city, city_id,
             round(latitude::numeric, 3) c3lat, round(longitude::numeric, 3) c3lng,
             public.dedup_despace(name) dsp, public.dedup_core_tokens(name, city) core,
             quality_score, is_featured, created_at
      from public.venues
      where duplicate_of_id is null and closed_at is null
        and review_status is distinct from 'archived'
        and data_source is distinct from 'refuge-restrooms'
        and name_normalized is not null and length(name_normalized) >= 3
        and latitude is not null and longitude is not null
    ),
    -- de-spaced key equi-join, geo-corroborated (<150 m)
    despace_pairs as (
      select a.id aid, b.id bid, a.quality_score aq, a.is_featured af, a.created_at ac,
             b.quality_score bq, b.is_featured bf, b.created_at bc
      from live a join live b
        on a.city_id = b.city_id and a.id < b.id and a.dsp = b.dsp
      where length(a.dsp) >= 4 and public.haversine_m(a.lat, a.lng, b.lat, b.lng) < 150
    ),
    -- core-token key equi-join, geo-corroborated (<150 m)
    core_pairs as (
      select a.id aid, b.id bid, a.quality_score aq, a.is_featured af, a.created_at ac,
             b.quality_score bq, b.is_featured bf, b.created_at bc
      from live a join live b
        on a.city_id = b.city_id and a.id < b.id and a.core = b.core
      where cardinality(a.core) >= 1 and a.dsp <> b.dsp
        and public.haversine_m(a.lat, a.lng, b.lat, b.lng) < 150
    ),
    -- trigram at the same spot (~110 m bucket), ≥0.92, <100 m
    tri_pairs as (
      select a.id aid, b.id bid, a.quality_score aq, a.is_featured af, a.created_at ac,
             b.quality_score bq, b.is_featured bf, b.created_at bc
      from live a join live b
        on a.c3lat = b.c3lat and a.c3lng = b.c3lng and a.id < b.id
      where extensions.similarity(a.nn, b.nn) >= 0.92
        and public.haversine_m(a.lat, a.lng, b.lat, b.lng) < 100
    ),
    pairs as (
      select distinct on (aid, bid) aid, bid, aq, af, ac, bq, bf, bc
      from (select * from despace_pairs union all select * from core_pairs
            union all select * from tri_pairs) u
    )
    select * from pairs limit greatest(p_limit, 0)
  loop
    v_eligible := v_eligible + 1;
    if (coalesce(r.aq, -1) >  coalesce(r.bq, -1))
       or (coalesce(r.aq, -1) = coalesce(r.bq, -1) and coalesce(r.af, false) and not coalesce(r.bf, false))
       or (coalesce(r.aq, -1) = coalesce(r.bq, -1) and coalesce(r.af, false) = coalesce(r.bf, false) and r.ac <= r.bc)
    then v_keep := r.aid; v_drop := r.bid;
    else v_keep := r.bid; v_drop := r.aid; end if;

    if p_dry_run then v_merged := v_merged + 1; continue; end if;

    begin
      perform public._venue_merge_core(v_keep, v_drop, null);
      v_merged := v_merged + 1;
    exception when others then v_skipped := v_skipped + 1;
    end;
  end loop;

  if not p_dry_run then v_chains := public.collapse_venue_dup_chains(); end if;

  return jsonb_build_object('dry_run', p_dry_run, 'eligible_pairs', v_eligible,
    'merged', v_merged, 'skipped', v_skipped, 'chains_collapsed', v_chains);
end; $function$;
