-- Geo Hierarchy Unification — P3: golden-set safety parity harness.
-- The spine-reading twin of location_is_high_risk + an exhaustive comparator.
-- location_is_high_risk is a PURE function of (country_id, city_id), so testing
-- every distinct pair in use — plus every city, every country, and the null
-- cases — is an exhaustive proof, not a sample.
--
-- HARD GATE: geo_safety_parity_check()->>'mismatches' must be '0' before the
-- live function is switched to the spine and before any P4 view swap.

create or replace function public.location_is_high_risk_spine(p_country_id uuid, p_city_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  with resolved as (
    select coalesce(
      p_country_id,
      (select gp.country_id from public.geo_places gp
        where gp.id = p_city_id and gp.place_type = 'city')
    ) as country_id
  )
  select exists (
    select 1
    from public.geo_country_profiles cp, resolved r
    where cp.place_id = r.country_id
      and (
        (cp.lgbti_criminalization->>'legal') = 'false'
        or lower(coalesce(cp.lgbti_criminalization->>'death_penalty','')) = 'yes'
      )
  );
$$;

comment on function public.location_is_high_risk_spine(uuid, uuid) is
  'Spine-reading twin of location_is_high_risk (P3). Compared exhaustively by geo_safety_parity_check() before cutover.';

create or replace function public.geo_safety_parity_check()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v jsonb;
begin
  create temp table _pairs on commit drop as
    select distinct country_id, city_id from public.venues
    union select distinct country_id, city_id from public.events
    union select distinct country_id, null::uuid from public.organizations
    union select distinct null::uuid, city_id from public.organizations
    union select distinct null::uuid, id from public.cities
    union select distinct id, null::uuid from public.countries
    union select null::uuid, null::uuid;

  create temp table _cmp on commit drop as
    select country_id, city_id,
           public.location_is_high_risk(country_id, city_id)       as old_val,
           public.location_is_high_risk_spine(country_id, city_id) as new_val
    from _pairs;

  select jsonb_build_object(
    'pairs_tested',      (select count(*) from _cmp),
    'mismatches',        (select count(*) from _cmp where old_val is distinct from new_val),
    'sample_mismatches', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                            from (select * from _cmp where old_val is distinct from new_val limit 5) s),
    'high_risk_old',     (select count(*) from _cmp where old_val),
    'high_risk_new',     (select count(*) from _cmp where new_val),
    'venue_flag_stale',  (select count(*) from public.venues v
                            join _cmp c on c.country_id is not distinct from v.country_id
                                       and c.city_id is not distinct from v.city_id
                           where v.safety_gated is distinct from c.new_val),
    'event_flag_stale',  (select count(*) from public.events e
                            join _cmp c on c.country_id is not distinct from e.country_id
                                       and c.city_id is not distinct from e.city_id
                           where e.safety_gated is distinct from c.new_val)
  ) into v;

  return v;
end $$;

revoke execute on function public.geo_safety_parity_check() from public, anon, authenticated;

comment on function public.geo_safety_parity_check() is
  'P4 HARD GATE: exhaustive old-vs-spine comparison of location_is_high_risk over every (country,city) pair in use. mismatches must be 0.';
