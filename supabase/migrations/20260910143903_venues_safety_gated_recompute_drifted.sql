-- !! THIS MIGRATION WAS WRONG. It is corrected by 20260910145524. Read that file first. !!
-- It reconstructed venues.safety_gated from location_is_high_risk() alone, but the rule is
-- `location_is_high_risk(country_id, city_id) OR category = 'cruising'`. All 122 rows it
-- "repaired" were cruising venues, deliberately gated everywhere; it ungated them for ~40
-- minutes until release_gate_checks().city_safety_gate_drift caught it. There was no drift.
-- The reasoning below is preserved unedited because the flawed step is the instructive part.
--
-- P3: 122 venues carried safety_gated=true while location_is_high_risk(country_id, city_id) says false.
-- Every one sits in a country with lgbti_criminalization->>'legal' = 'true' (Spain 36, Germany 21,
-- Italy 10, Brazil 8, France 7, UK 7, NL 4, ...). Effect: hidden from logged-out visitors, excluded
-- from anon search, non-indexable by crawlers. Same class as the 86 wrong-country safety_notes --
-- a derived flag that outlived the input it was derived from (a historical city/country relink).
--
-- Direction matters and was measured before writing this: should_be_gated_but_public = 0 across
-- venues, events, organizations and hotels. There is no fail-open row. This repair only ever
-- UNGATES rows the predicate says are safe; it can never publish a row the predicate wants hidden.
--
-- trg_venues_safety_gated is scoped BEFORE UPDATE OF country_id, city_id, so assigning safety_gated
-- directly does not re-fire it. 122 rows is far under the batch discipline for the search-sync chain.

do $$
declare
  v_before integer;
  v_fixed  integer;
  v_open   integer;
begin
  select count(*) into v_before
  from public.venues
  where safety_gated is distinct from public.location_is_high_risk(country_id, city_id);

  -- Refuse to run if a fail-open row exists: that would be a different, more urgent defect
  -- and this migration is not the right instrument for it.
  select count(*) into v_open
  from public.venues
  where public.location_is_high_risk(country_id, city_id)
    and not coalesce(safety_gated, false);

  if v_open > 0 then
    raise exception 'aborting: % venue(s) are high-risk but publicly visible; fail-open must be triaged, not batch-fixed', v_open;
  end if;

  update public.venues v
  set safety_gated = public.location_is_high_risk(v.country_id, v.city_id)
  where v.safety_gated is distinct from public.location_is_high_risk(v.country_id, v.city_id);

  get diagnostics v_fixed = row_count;

  raise notice 'safety_gated drift repaired: % rows examined, % rows updated', v_before, v_fixed;

  -- Re-assert the invariant the migration exists to establish.
  if exists (
    select 1 from public.venues
    where safety_gated is distinct from public.location_is_high_risk(country_id, city_id)
  ) then
    raise exception 'safety_gated still drifted after repair';
  end if;
end $$;
