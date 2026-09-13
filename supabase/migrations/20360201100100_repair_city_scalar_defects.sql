-- Retract physically impossible city scalars.
--
-- Companion to 20360201100000, which explains the defect and its producer. This
-- migration clears what that producer already wrote. Dry-run in a rolled-back
-- transaction on prod, 2026-09-08:
--
--   area_impossible             181 -> 0
--   elevation_impossible          1 -> 0
--   population_exceeds_country    4 -> 0
--   density_impossible           35 -> 33   (two resolved via the population arm)
--
-- RETRACT, NEVER RECOMPUTE. The dominant defect is a factor of 1e6 — Calgary
-- stored 825,290,000 for a city of 825.29 km2, i.e. square metres under the km2
-- label — so dividing by 1e6 is tempting and is wrong. Only **58%** of the 181
-- divide cleanly; the rest would acquire a *plausible* wrong number instead of
-- an obvious one, and a plausible wrong number is never looked at again. El Reno
-- is the counter-example: 8,300,000,226 becomes 8,300 km2 for a city of ~44.
--
-- A NULL is also self-healing in a way a guess is not. The unit bug is fixed at
-- the source (_shared/wikidata-city.ts converts the Wikidata unit QID or writes
-- nothing), `city-factual-backfill` is fill-if-empty, and no enrichment_status
-- sentinel governs these two columns — so an emptied column is refilled, with
-- the correct conversion, on that city's next visit. That is the whole reason
-- the fill-if-empty rule made the original values permanent: nothing overwrote
-- them, and the engine had already fetched the right answer and declined.
-- Measured: 234 cities hold a population that disagrees with the Wikidata
-- candidate recorded in their own field_provenance by more than 2x.
--
-- DENSITY IS DELIBERATELY NOT RETRACTED — 33 rows survive this migration and
-- that is the intended end state, not an incomplete job. A density defect does
-- not identify WHICH column is wrong. Paris carries 12,000,000 (the metro) over
-- 105.4 km2 (the commune); blanking either column on a rule would destroy a
-- correct value half the time. They are flagged for a human via the sentinel.
--
-- Every retracted value is preserved under field_provenance.<col>.retracted.
-- Unpublishing removes a claim rather than making one — the precedent is the
-- safety_notes retraction in 20260816112824.
--
-- 300 is the standing cities batch cap: an UPDATE here fires
-- trg_sync_geo_spine -> geo_places -> search_reindex_queue, one row at a time.
-- It is applied as a LOOP, not a single capped statement — see the comment on
-- the DO block for why a cap plus a zero-assertion is self-blocking.

-- `a || b` on jsonb RAISES `invalid concatenation of jsonb objects` when either
-- side is a scalar, and SILENTLY produces an array when either side is an array.
-- `cities.field_provenance` has several writers (city-factual-backfill's
-- addCandidate, city-corroboration, hand-repair migrations, the safety-notes
-- stamper), so one row out of 186 holding a bare number under `area_km2` would
-- abort this whole transaction — and `db push` failing here does not stop the
-- deploy workflow, which continues to `functions deploy` and would ship the fixed
-- edge functions against a schema with neither sentinel nor repair.
create or replace function public._jsonb_obj(v jsonb, fallback jsonb default '{}'::jsonb)
returns jsonb language sql immutable as $$
  select case when jsonb_typeof(v) = 'object' then v else fallback end;
$$;

-- Batched drain rather than a single capped statement.
--
-- A bare `limit 300` plus the zero-assertion below is self-blocking: if more than
-- 300 rows ever qualify at apply time, the UPDATE clears 300, the assertion
-- RAISEs, and the migration becomes unapplyable rather than re-runnable — the
-- exact opposite of what the cap is for. The cap's real job is bounding each
-- statement's trigger fan-out (cities -> trg_sync_geo_spine -> geo_places ->
-- search_reindex_queue, one row at a time), which a loop preserves.
--
-- The iteration ceiling is a runaway guard, not a work limit: 186 rows qualified
-- when this was written, so 50 batches is ~80x headroom and still terminates if a
-- predicate is ever made non-converging.
do $repair$
declare
  moved int;
  rounds int := 0;
  total int := 0;
begin
  loop
    with target as (
      select c.id,
             (c.area_km2 is not null and (c.area_km2 <= 0 or c.area_km2 > 200000)) as bad_area,
             (c.elevation_m is not null and (c.elevation_m < -500 or c.elevation_m > 5300)) as bad_elev,
             (c.population is not null and co.population is not null
                and c.population > co.population) as bad_pop
      from public.cities c
      left join public.countries co on co.id = c.country_id
      where c.duplicate_of_id is null
    ),
    todo as (
      select * from target
      where bad_area or bad_elev or bad_pop
      order by id          -- deterministic batches; without it "which 300" is planner-dependent
      limit 300
    )
    update public.cities c set
      area_km2    = case when t.bad_area then null else c.area_km2 end,
      elevation_m = case when t.bad_elev then null else c.elevation_m end,
      population  = case when t.bad_pop  then null else c.population end,
      -- `needs_attention` is deliberately NOT set. It reads like the right flag
      -- and is the wrong one here: run_city_trust_recompute subtracts 0.15 for it
      -- (a 15-point trust penalty for retracting a field that contributes nothing
      -- to completeness — compute_city_completeness never reads area or
      -- elevation), and approve_city_review/reject_city_review clear it
      -- unconditionally once no other open review remains, so an unrelated
      -- approval would erase it with no record it was ever set. The durable
      -- record is field_provenance.<col>.retracted plus the sentinel's
      -- retracted_pending_refill; those cannot be cleared by a passer-by.
      field_provenance = public._jsonb_obj(c.field_provenance)
        || case when t.bad_area then jsonb_build_object('area_km2',
             public._jsonb_obj(c.field_provenance -> 'area_km2') || jsonb_build_object(
               'retracted', jsonb_build_object(
                 'value', c.area_km2, 'reason', 'implausible_area', 'at', now()))) else '{}'::jsonb end
        || case when t.bad_elev then jsonb_build_object('elevation_m',
             public._jsonb_obj(c.field_provenance -> 'elevation_m') || jsonb_build_object(
               'retracted', jsonb_build_object(
                 'value', c.elevation_m, 'reason', 'implausible_elevation', 'at', now()))) else '{}'::jsonb end
        || case when t.bad_pop then jsonb_build_object('population',
             public._jsonb_obj(c.field_provenance -> 'population') || jsonb_build_object(
               'retracted', jsonb_build_object(
                 'value', c.population, 'reason', 'population_exceeds_country', 'at', now()))) else '{}'::jsonb end
    from todo t
    where t.id = c.id;

    get diagnostics moved = row_count;
    total := total + moved;
    rounds := rounds + 1;
    exit when moved = 0;
    if rounds > 50 then
      raise exception 'city scalar repair did not converge after % rounds (% rows moved)', rounds, total;
    end if;
  end loop;
  raise notice 'city scalar repair: % rows retracted in % rounds', total, rounds;
end
$repair$;

-- Re-assert the condition this migration exists to fix. A repair that reports
-- success without checking its own postcondition is how a false green ships.
do $verify$
declare
  d jsonb := public.city_scalar_defects();
begin
  if (d->>'area_impossible')::int <> 0
     or (d->>'elevation_impossible')::int <> 0
     or (d->>'population_exceeds_country')::int <> 0 then
    raise exception 'city scalar repair incomplete: %', d;
  end if;
  -- Not an assertion of zero: density is reported, not retracted (see above).
  raise notice 'city scalar repair complete; density still flagged for review: %',
    d->>'density_impossible';
end
$verify$;
