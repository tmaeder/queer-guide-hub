-- city_scalar_defects(): the sentinel for physically impossible city scalars.
--
-- WHY THIS EXISTS. `area_km2` and `elevation_m` had NO validator branch anywhere
-- in the pipeline, and population was checked only for `isFinite && >= 0`. There
-- was likewise no validate-stage sentinel of any kind — no section of
-- check-pipeline-health.mjs read ai_validation_status or the warning
-- distribution. Measured on prod 2026-09-08, what that admitted:
--
--   area  <= 0 or > 200,000 km2 ......................... 181 cities
--   elevation < -500 m or > 5,300 m ..................... 1
--   population greater than its own country's ........... 4
--   density > 50,000 /km2 ............................... 35
--
--   El Reno, US            area  8,300,000,226 km2
--   City of Hamilton, BM   area  1,138,110,000 km2   (~7x Earth's land area)
--   Calgary, CA            area    825,290,000 km2   (real: 825.29 km2)
--   Maui, US               elevation    10,023 m     (above Everest)
--   Norfolk, US            population 343,000,000    (above the entire US)
--
-- THE PRODUCER IS A UNIT BUG, and Calgary names it: 825,290,000 is 825.29 km2
-- expressed in SQUARE METRES. `parseCityFacts` read a Wikidata quantity's
-- `.amount` and ignored its `.unit`, so a P2046 stated in Q25343 (square metre)
-- or a P2044 in Q3710 (foot) was stored under the km2/m label. Both units occur
-- in a 15-city sample of the live API. Fixed in _shared/wikidata-city.ts, which
-- now converts or writes nothing.
--
-- WHY A STANDALONE FUNCTION rather than another key on pipeline_hygiene_stats:
-- that function is ~150 lines and every addition rewrites the whole body, which
-- is a merge-collision surface. Precedent: event_dup_signals(), venue_dup_signals().
--
-- THE BOUNDS ARE MIRRORED IN TYPESCRIPT (_shared/city-scalar-bounds.ts, the one
-- definition imported by both the staging validator and city-factual-backfill)
-- and drift-tested against this file by cityScalarBounds.test.ts. Change one,
-- change both, or the gate and the producers disagree about what a defect is.
--
-- Each bound sits just outside the real-world extreme, named so it can be
-- checked rather than trusted:
--   200,000 km2  Altamira, Brazil (~159,533) is the largest municipality
--   -500 m       the Dead Sea shore, lowest dry land, is about -430
--   5,300 m      La Rinconada, Peru (~5,100) is the highest permanent settlement
--   50,000 /km2  Manila, the densest city on Earth, is about 43,000
--
-- DENSITY IS REPORTED BUT NEVER RETRACTED, and that asymmetry is the point.
-- A density defect does not say WHICH of the two columns is wrong. Paris holds
-- 12,000,000 (Ile-de-France, the metro) over 105.4 km2 (the commune) — the
-- population is the wrong one there, but nothing in the pair says so, and
-- field_provenance still records the 2,103,778 Wikidata supplied and that the
-- fill-if-empty rule then declined to write. Guessing a column to blank is how a
-- repair destroys a good value.

create or replace function public.city_scalar_defects()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with live as (
    select c.id, c.name, c.slug, c.population as p, c.area_km2 as a, c.elevation_m as e,
           c.country_id, c.field_provenance as fp
    from public.cities c
    where c.duplicate_of_id is null
  ),
  bad_area as (select * from live where a is not null and (a <= 0 or a > 200000)),
  bad_elev as (select * from live where e is not null and (e < -500 or e > 5300)),
  bad_pop  as (
    select l.* from live l
    join public.countries co on co.id = l.country_id
    where l.p is not null and co.population is not null and l.p > co.population
  ),
  -- Excludes rows whose area already failed its own bound: a density derived
  -- from a rejected area is not extra information, it is the same defect twice.
  --
  -- The division is inside a CASE rather than guarded by a preceding `a > 0` in
  -- the same WHERE. SQL does not promise left-to-right qual evaluation — the
  -- planner reorders by cost — and `cities_area_nonneg_check` permits
  -- `area_km2 = 0`, so a plan change could float the division ahead of its guard
  -- and 500 the RPC. A CASE is safe by construction; an ordering assumption is
  -- safe only until the next ANALYZE.
  bad_dens as (
    select * from live
    where p > 0 and not (a is null or a <= 0 or a > 200000)
      and (case when a > 0 then p / a else null end) > 50000
  )
  select jsonb_build_object(
    'area_impossible',            (select count(*) from bad_area),
    'elevation_impossible',       (select count(*) from bad_elev),
    'population_exceeds_country', (select count(*) from bad_pop),
    'density_impossible',         (select count(*) from bad_dens),
    -- Retracted by 20360201100100 and not yet refilled by city-factual-backfill.
    -- Expected to fall on its own; a flat line means the refill path is dead,
    -- which is the failure this key exists to make visible rather than the
    -- retraction itself.
    --
    -- Counts ALL THREE retracted columns, not just area. An earlier draft counted
    -- `area_km2` alone, which made the 1 elevation and 4 population retractions
    -- invisible from the moment the repair committed.
    --
    -- `qid_conflict` rows are EXCLUDED. `city-factual-backfill` skips a city whose
    -- QID collided, so such a row can never refill — it would sit here forever and
    -- permanently falsify this key's stated meaning. Paris carries one.
    --
    -- The coalesce is load-bearing: `NULL ? 'k'` is NULL and `not NULL` is NULL,
    -- so testing the raw column would drop every city with no enrichment_status
    -- out of the count entirely — undercounting silently, in the direction that
    -- makes the gate look healthier than it is.
    'retracted_pending_refill', (
      select count(*) from public.cities c
      where c.duplicate_of_id is null
        and not (coalesce(c.enrichment_status, '{}'::jsonb) ? 'qid_conflict')
        and (
          (c.field_provenance -> 'area_km2'    ? 'retracted' and c.area_km2    is null) or
          (c.field_provenance -> 'elevation_m' ? 'retracted' and c.elevation_m is null) or
          (c.field_provenance -> 'population'  ? 'retracted' and c.population  is null)
        )
    ),
    -- One sample per hard key. A single area-only list printed under an elevation
    -- or population failure reads as "no examples exist".
    'samples', jsonb_build_object(
      'area', coalesce((select jsonb_agg(x) from (
         select name, a::text as value from bad_area order by a desc limit 3) x), '[]'::jsonb),
      'elevation', coalesce((select jsonb_agg(x) from (
         select name, e::text as value from bad_elev order by abs(e) desc limit 3) x), '[]'::jsonb),
      'population', coalesce((select jsonb_agg(x) from (
         select name, p::text as value from bad_pop order by p desc limit 3) x), '[]'::jsonb)
    )
  );
$function$;

comment on function public.city_scalar_defects() is
  'Physically impossible city scalars (area/elevation/population/density). Bounds '
  'mirror _shared/city-scalar-bounds.ts and are drift-tested. Read by '
  'scripts/check-pipeline-health.mjs section 11b.';

-- Sentinels are operator tooling. Narrow from the start rather than after the
-- fact, as venue_dup_signals had to be by 20280301104412.
revoke all on function public.city_scalar_defects() from public, anon, authenticated;
grant execute on function public.city_scalar_defects() to service_role;
