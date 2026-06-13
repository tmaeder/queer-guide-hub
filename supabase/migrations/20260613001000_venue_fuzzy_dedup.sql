-- Venue data-quality remediation — Phase 1: retroactive fuzzy dedup (2026-06-13)
--
-- Ingest-time dedup (find_venue_duplicate_candidates) catches fuzzy/phone/domain
-- dups, but the only RETROACTIVE surface (find_duplicate_clusters, behind
-- /admin/duplicates) matches EXACT normalized title+city — it misses word-order
-- swaps, punctuation variants and same-place re-listings sitting in the live set.
--
-- Diagnosis of the live data also showed the phone/email/DOMAIN signals are
-- heavily polluted by platform/aggregator values (misterbandb.com on 311 distinct
-- hotels, facebook.com on 86, shared chain phones), so blind auto-merge on those
-- would collapse distinct venues. The genuinely safe signal is "near-identical
-- name at effectively the same coordinates" — verified precise on sampled data
-- (Eagle Houston/Houston EAGLE, Julius'/Julius, Woody's Dallas/Dallas Woody's …).
--
-- This migration:
--   1. Factors the merge body into _venue_merge_core(keep, drop, actor) so an
--      automated pass can reuse it (merge_venues' admin gate blocks service-role).
--   2. find_fuzzy_duplicate_clusters() — read-only review surface returning
--      name-corroborated pairs with score/distance + an auto_eligible flag.
--   3. run_venue_fuzzy_automerge() — merges ONLY auto_eligible pairs (name ≥0.92
--      AND ≤100 m apart); everything else is left for human review.
--   4. collapse_venue_dup_chains() — keeps duplicate_of_id pointing at the
--      ultimate survivor so the critical dup_integrity release gate stays green.
-- All idempotent (CREATE OR REPLACE).

-- ---------------------------------------------------------------------------
-- 1a. _venue_merge_core — the merge body, actor-parameterised, no admin gate.
--     (Caller is responsible for authorisation.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._venue_merge_core(p_keep_id uuid, p_drop_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid;
  v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;

  select duplicate_of_id into v_keep_dup from public.venues where id = p_keep_id;
  if not found then raise exception 'keep venue % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep venue is itself a duplicate'; end if;

  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.venues where id = p_drop_id;
  if not found then raise exception 'drop venue % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop venue already merged'; end if;

  update public.events set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('events', n);
  update public.festivals set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('festivals', n);
  update public.marketplace_listings set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_listings', n);
  update public.trip_places set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_places', n);
  update public.venue_checkins set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_checkins', n);

  update public.venue_reviews r set venue_id = p_keep_id where r.venue_id = p_drop_id
    and not exists (select 1 from public.venue_reviews k where k.venue_id = p_keep_id and k.user_id = r.user_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_reviews', n);

  update public.venue_personal_visits v set venue_id = p_keep_id where v.venue_id = p_drop_id
    and not exists (select 1 from public.venue_personal_visits k where k.venue_id = p_keep_id and k.user_id = v.user_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_personal_visits', n);

  update public.venue_guide_picks g set venue_id = p_keep_id where g.venue_id = p_drop_id
    and not exists (select 1 from public.venue_guide_picks k where k.venue_id = p_keep_id and k.guide_id = g.guide_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_guide_picks', n);

  update public.venue_sources s set venue_id = p_keep_id where s.venue_id = p_drop_id
    and not exists (select 1 from public.venue_sources k where k.venue_id = p_keep_id
                    and k.source_slug = s.source_slug and k.source_entity_id is not distinct from s.source_entity_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_sources', n);

  if v_drop_slug is not null then
    insert into public.venue_slug_redirects (old_slug, venue_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set venue_id = excluded.venue_id;
  end if;

  update public.venues set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  insert into public.venue_merge_audit (keep_id, drop_id, actor, reparented)
    values (p_keep_id, p_drop_id, p_actor, v_counts) returning id into v_audit_id;

  return jsonb_build_object('audit_id', v_audit_id, 'keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $function$;

-- ---------------------------------------------------------------------------
-- 1b. merge_venues — admin-gated thin wrapper (unchanged behaviour for the UI).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_venues(p_keep_id uuid, p_drop_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid := auth.uid();
begin
  if not exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  return public._venue_merge_core(p_keep_id, p_drop_id, v_actor);
end; $function$;

-- ---------------------------------------------------------------------------
-- 2. collapse_venue_dup_chains — re-point chained/dangling duplicate_of_id at the
--    ultimate non-duplicate survivor. Keeps the critical dup_integrity gate green
--    after any batch merge (the gate has regressed twice — see 20260607140000/_2).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.collapse_venue_dup_chains()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n int;
begin
  perform public.assert_admin_or_internal();
  with recursive walk as (
    select v.id as node, v.duplicate_of_id as target, 1 as depth
    from public.venues v where v.duplicate_of_id is not null
    union all
    select w.node, r.duplicate_of_id, w.depth + 1
    from walk w join public.venues r on r.id = w.target
    where r.duplicate_of_id is not null and w.depth < 25
  ),
  ultimate as (
    select distinct on (node) node, target as ult from walk order by node, depth desc
  )
  update public.venues v set duplicate_of_id = u.ult, updated_at = now()
  from ultimate u
  where v.id = u.node and u.ult is not null and v.duplicate_of_id is distinct from u.ult;
  get diagnostics n = row_count;
  return n;
end; $function$;

-- ---------------------------------------------------------------------------
-- 3. find_fuzzy_duplicate_clusters — read-only review surface.
--    Pairs of LIVE venues with corroborated near-identical names: either at
--    effectively the same coordinates (geo) or in the same city when one lacks
--    coords. auto_eligible = name ≥0.92 AND ≤100 m (what the automerge acts on).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_fuzzy_duplicate_clusters(
  p_limit integer DEFAULT 200,
  p_min_name_sim numeric DEFAULT 0.80
)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
with live as (
  select id, name, name_normalized nn, slug, city, country, city_id,
         latitude lat, longitude lng,
         round(latitude::numeric, 2) clat, round(longitude::numeric, 2) clng,
         quality_score, is_featured
  from public.venues
  where duplicate_of_id is null and closed_at is null
    and review_status is distinct from 'archived'
    and data_source is distinct from 'refuge-restrooms'
    and name_normalized is not null and length(name_normalized) >= 3
),
geo_pairs as (
  select a.id aid, b.id bid, extensions.similarity(a.nn, b.nn)::numeric name_sim,
         public.haversine_m(a.lat, a.lng, b.lat, b.lng) dist
  from live a join live b
    on a.clat = b.clat and a.clng = b.clng and a.id < b.id
   and a.lat is not null and b.lat is not null
  where extensions.similarity(a.nn, b.nn) >= p_min_name_sim
),
city_pairs as (
  select a.id aid, b.id bid, extensions.similarity(a.nn, b.nn)::numeric name_sim, null::double precision dist
  from live a join live b
    on a.city_id is not distinct from b.city_id and a.city_id is not null and a.id < b.id
   and a.nn % b.nn
  where (a.lat is null or b.lat is null)
    and extensions.similarity(a.nn, b.nn) >= greatest(p_min_name_sim, 0.88)
),
edges as (
  select aid, bid, max(name_sim) name_sim, min(dist) dist
  from (select * from geo_pairs union all select * from city_pairs) u
  group by aid, bid
),
ranked as (
  select e.*,
    (e.name_sim >= 0.92 and e.dist is not null and e.dist < 100) as auto_eligible
  from edges e
  order by auto_eligible desc, name_sim desc, dist asc nulls last
  limit greatest(p_limit, 0)
)
select coalesce(jsonb_agg(jsonb_build_object(
  'score', round(r.name_sim, 3),
  'match_type', case when r.dist is not null then 'geo_name' else 'city_name' end,
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

-- ---------------------------------------------------------------------------
-- 4. run_venue_fuzzy_automerge — merge ONLY the unambiguous same-place pairs.
--    Canonical = higher quality_score → is_featured → older. Reversible via the
--    standard venue_merge_audit / unmerge_venues path (actor NULL = automated).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_venue_fuzzy_automerge(
  p_dry_run boolean DEFAULT true,
  p_limit integer DEFAULT 1000
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  r record;
  v_keep uuid; v_drop uuid;
  v_merged int := 0; v_skipped int := 0; v_eligible int := 0;
  v_chains int := 0;
begin
  perform public.assert_admin_or_internal();

  for r in
    with live as (
      select id, name_normalized nn, latitude lat, longitude lng,
             round(latitude::numeric, 2) clat, round(longitude::numeric, 2) clng,
             quality_score, is_featured, created_at
      from public.venues
      where duplicate_of_id is null and closed_at is null
        and review_status is distinct from 'archived'
        and data_source is distinct from 'refuge-restrooms'
        and name_normalized is not null and length(name_normalized) >= 3
        and latitude is not null and longitude is not null
    )
    select a.id aid, b.id bid,
           a.quality_score aq, a.is_featured af, a.created_at ac,
           b.quality_score bq, b.is_featured bf, b.created_at bc
    from live a join live b
      on a.clat = b.clat and a.clng = b.clng and a.id < b.id
    where extensions.similarity(a.nn, b.nn) >= 0.92
      and public.haversine_m(a.lat, a.lng, b.lat, b.lng) < 100
    limit greatest(p_limit, 0)
  loop
    v_eligible := v_eligible + 1;

    -- Canonical = higher quality_score, then featured, then older.
    if (coalesce(r.aq, -1) >  coalesce(r.bq, -1))
       or (coalesce(r.aq, -1) = coalesce(r.bq, -1) and coalesce(r.af, false) and not coalesce(r.bf, false))
       or (coalesce(r.aq, -1) = coalesce(r.bq, -1) and coalesce(r.af, false) = coalesce(r.bf, false) and r.ac <= r.bc)
    then
      v_keep := r.aid; v_drop := r.bid;
    else
      v_keep := r.bid; v_drop := r.aid;
    end if;

    if p_dry_run then
      v_merged := v_merged + 1;
      continue;
    end if;

    -- A prior iteration in this run may have already merged one side.
    begin
      perform public._venue_merge_core(v_keep, v_drop, null);
      v_merged := v_merged + 1;
    exception when others then
      v_skipped := v_skipped + 1;
    end;
  end loop;

  if not p_dry_run then
    v_chains := public.collapse_venue_dup_chains();
  end if;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'eligible_pairs', v_eligible,
    'merged', v_merged,
    'skipped', v_skipped,
    'chains_collapsed', v_chains
  );
end; $function$;

GRANT EXECUTE ON FUNCTION public.find_fuzzy_duplicate_clusters(integer, numeric) TO authenticated;
