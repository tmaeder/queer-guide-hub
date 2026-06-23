-- Dedup name-keys — performance fix #2 (2026-06-23)
--
-- The retroactive finder + automerge still timed out: the trigram tiers
-- (geo_pairs / city_pairs / tri_pairs) join an un-indexed CTE and evaluate
-- similarity()/`%` across every same-bucket or same-city pair — O(n²) per
-- bucket/city, and placeholder coordinates pile many venues into one cell.
--
-- The deterministic despaced/core-token keys are EQUI-joins (selective: max
-- group size 3–4) and run in ~1.2 s over the full venue set. They catch every
-- duplicate shape the user reported (spacing, punctuation, word-order,
-- token-subset) — verified on the live Berlin set. So the retroactive surfaces
-- now use keys ONLY. Ingest-time still has trigram name_proximity for new rows.

CREATE OR REPLACE FUNCTION public.find_fuzzy_duplicate_clusters(
  p_limit integer DEFAULT 200, p_min_name_sim numeric DEFAULT 0.80)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp' AS $function$
with live as (
  select id, name, slug, city, country, city_id, latitude lat, longitude lng,
         public.dedup_despace(name) dsp, public.dedup_core_tokens(name, city) core,
         quality_score, is_featured
  from public.venues
  where duplicate_of_id is null and closed_at is null
    and review_status is distinct from 'archived'
    and data_source is distinct from 'refuge-restrooms'
    and name_normalized is not null and length(name_normalized) >= 3
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
  from (select * from despace_pairs union all select * from core_pairs) u
  group by aid, bid
),
ranked as (
  select e.*,
    -- geo-corroborated only: identical key AND within 150 m
    (e.dist is not null and e.dist < 150) as auto_eligible
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
      select id, latitude lat, longitude lng, city, city_id,
             public.dedup_despace(name) dsp, public.dedup_core_tokens(name, city) core,
             quality_score, is_featured, created_at
      from public.venues
      where duplicate_of_id is null and closed_at is null
        and review_status is distinct from 'archived'
        and data_source is distinct from 'refuge-restrooms'
        and name_normalized is not null and length(name_normalized) >= 3
        and latitude is not null and longitude is not null
    ),
    despace_pairs as (
      select a.id aid, b.id bid, a.quality_score aq, a.is_featured af, a.created_at ac,
             b.quality_score bq, b.is_featured bf, b.created_at bc
      from live a join live b
        on a.city_id = b.city_id and a.id < b.id and a.dsp = b.dsp
      where length(a.dsp) >= 4 and public.haversine_m(a.lat, a.lng, b.lat, b.lng) < 150
    ),
    core_pairs as (
      select a.id aid, b.id bid, a.quality_score aq, a.is_featured af, a.created_at ac,
             b.quality_score bq, b.is_featured bf, b.created_at bc
      from live a join live b
        on a.city_id = b.city_id and a.id < b.id and a.core = b.core
      where cardinality(a.core) >= 1 and a.dsp <> b.dsp
        and public.haversine_m(a.lat, a.lng, b.lat, b.lng) < 150
    ),
    pairs as (
      select distinct on (aid, bid) aid, bid, aq, af, ac, bq, bf, bc
      from (select * from despace_pairs union all select * from core_pairs) u
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

-- Marketplace fuzzy finder: merchant_domain alone is NOT selective (one merchant
-- can hold thousands of listings → n² with the trigram fallback). Rewrite to
-- despaced/core EQUI-joins (domain+key), drop the trigram-over-domain tier.
CREATE OR REPLACE FUNCTION public.find_marketplace_fuzzy_duplicate_clusters(p_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions','pg_temp' AS $function$
with live as (
  select id, title, slug, merchant_domain,
         public.dedup_despace(title) dsp, public.dedup_core_tokens(title, null) core, quality_score
  from public.marketplace_listings
  where duplicate_of_id is null and status = 'active'
    and merchant_domain is not null
    and title_normalized is not null and length(title_normalized) >= 3
),
despace_pairs as (
  select a.id aid, b.id bid, 0.97::numeric name_sim, true as despaced_eq
  from live a join live b
    on a.merchant_domain = b.merchant_domain and a.id < b.id and a.dsp = b.dsp
  where length(a.dsp) >= 4
),
core_pairs as (
  select a.id aid, b.id bid, 0.90::numeric name_sim, false as despaced_eq
  from live a join live b
    on a.merchant_domain = b.merchant_domain and a.id < b.id and a.core = b.core
  where cardinality(a.core) >= 1 and a.dsp <> b.dsp
),
edges as (
  select aid, bid, max(name_sim) name_sim, bool_or(despaced_eq) despaced_eq
  from (select * from despace_pairs union all select * from core_pairs) u
  group by aid, bid
),
ranked as (
  select * from edges order by despaced_eq desc, name_sim desc limit greatest(p_limit, 0)
)
select coalesce(jsonb_agg(jsonb_build_object(
  'score', round(r.name_sim, 3),
  'match_type', case when r.despaced_eq then 'same_merchant_key' else 'same_merchant_tokens' end,
  'dist_m', null,
  'auto_eligible', r.despaced_eq,
  'count', 2,
  'members', jsonb_build_array(
    jsonb_build_object('id', a.id, 'title', a.title, 'slug', a.slug, 'city', null, 'country', null, 'quality_score', a.quality_score, 'is_featured', null),
    jsonb_build_object('id', b.id, 'title', b.title, 'slug', b.slug, 'city', null, 'country', null, 'quality_score', b.quality_score, 'is_featured', null)
  )
) order by r.despaced_eq desc, r.name_sim desc), '[]'::jsonb)
from ranked r join live a on a.id = r.aid join live b on b.id = r.bid;
$function$;

-- The event fuzzy finder + event/marketplace nightly sweeps join on venue_id /
-- merchant_domain partitions that are tightly bounded (events-per-venue is small;
-- the marketplace sweep uses window functions, not a self-join) — left as-is.
