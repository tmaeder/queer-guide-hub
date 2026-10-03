-- `link_event_venues` auto-links an event to a venue on
--   name_exact AND (distance_m IS NULL OR distance_m < 500)
-- and then HAVING count(*) = 1. The 500 METRES is the subject of this file.
--
-- WHAT THE DISTANCE ACTUALLY MEASURES HERE, AND WHY 500 m IS THE WRONG BOUND.
-- `find_event_venue_candidates` requires `e.city_id IS NOT NULL` and joins
-- `venues v ON v.city_id = ev.city_id`, so **same-city is STRUCTURAL** -- every
-- candidate pair is already in one city by construction. The distance is
-- therefore not a measure of disagreement; it is the gap between where the
-- EVENT sits (overwhelmingly its city's centroid, because scraped events carry
-- no address) and where the VENUE sits (a street address). A 500 m ceiling asks
-- a centroid to be within walking distance of a doorway.
--
-- MEASURED ON PROD 2026-10-03, at p_limit 2000:
--
--   540  events with a UNIQUE name-exact candidate
--   334  pass the current 500 m gate
--   540  pass at 25 km AND at 100 km -- identical, because the largest
--        distance in the whole candidate set is 11.29 km
--     2  events excluded as ambiguous (two same-named venues in one city)
--     6  pairs have a NULL distance (one side lacks coordinates)
--
-- So 206 correct links are blocked by the bound. The 58 distinct venues behind
-- them were read by hand, not sampled: Regenbogenhaus Zürich (37 events), Blond
-- Berlin (36), delphi LUX (19), Schwules Museum (14), KitKatClub, Berghain,
-- Kunstmuseum Basel, Mission Dolores Park, Goodale Park Columbus, Hyatt Regency
-- Dallas, Fuse Club Brussels, Das Werk Vienna ... Every one is a real venue
-- whose normalised name matches its event's `venue_name` exactly, in the same
-- city. NOT ONE is a namesake. The worst, 11.29 km, is Arnsberg -- a small
-- German town whose centroid is simply far from the venue.
--
-- THE PRODUCTION NUMBER IS WORSE THAN THE ONE ABOVE, AND THE ABOVE IS THE
-- MISLEADING ONE. The hourly cron `event_venue_link` (`25 * * * *`, enabled,
-- live in `cron.job`) calls `run_event_venue_link()`, which calls
-- `link_event_venues(500, true, false)` -- p_limit **500**, not 2000. At that
-- limit the candidate generator's `ORDER BY e.start_date DESC` returns the
-- newest-dated unlinked events, and those are dominated by city-centroid rows
-- that no 500 m test can pass. Measured from its own run log:
--
--   303 runs since 2026-09-22, 27,995 examined, 109 LINKED -- a 0.39% rate,
--   and only 25 of 303 runs linked anything at all.
--
-- Dry run at the cron's own p_limit=500, with this patch applied in a
-- rolled-back transaction: candidates 47, linked **0 -> 44**, 3 to review.
--
-- A FIRST DRAFT OF THIS HEADER SAID THE OPPOSITE and the mistake is worth
-- keeping: an early reading observed "0 auto-linked", I re-measured at
-- p_limit=2000, got 334 of 540, and used that to overturn the correct
-- observation as an "artifact". Both figures are real and they answer different
-- questions -- 62% of the whole candidate set passes, while 0.39% of what
-- PRODUCTION examines does. The window is a moving one (a linked row leaves
-- `venue_id IS NULL`), so rows the gate can never pass permanently occupy the
-- head of it and starve everything behind them. Measure at the shape production
-- actually runs, not at the shape that is convenient to query.
--
-- WHY THE BOUND IS NOT REPLACED BY A "SECOND SIGNAL", which was the first plan.
-- Adding `venue.city_id = event.city_id` to the gate looks like the textbook
-- corroboration this codebase requires -- and it is a NO-OP, because the join
-- above already guarantees it. Measured: 544 of 544 name-exact pairs are
-- same-city, which is tautological rather than evidence. A condition that
-- cannot fail is not a guard; shipping one as though it were is the vacuous-
-- assertion class. The gate ALREADY carries two independent signals (an exact
-- normalised name, and the same city) plus an ambiguity veto; the distance test
-- is a redundant third.
--
-- WHY 100 km AND NOT 25 km. On this corpus the two are indistinguishable (540
-- either way), so the choice rests on a property rather than a yield:
-- `event_venue_link_signals()` reports every event↔venue link over **100 km**
-- as drift. Setting the auto-link gate to the same number means the linker can
-- never mint a link its own watchdog will flag -- a gate that can raise its own
-- alarm is a self-inflicted false positive. 25 km would additionally block a
-- legitimate link in a genuinely large city (Los Angeles is ~70 km across)
-- while same-city is already assured. Independently, `tg_event_venue_geography`
-- still refuses to propagate a venue's geography to an event more than 250 km
-- away, so the dangerous direction keeps its own veto.
--
-- NULL distance keeps FAILING OPEN, and now has a reason it did not have
-- before: with same-city structural and the name exact, absence of coordinates
-- is absence of evidence, not disagreement. 6 pairs today.
--
-- Fuzzy candidates (`similarity >= 0.80`) are untouched and still go to review.
-- `name_exact` remains required for the auto path.
--
-- PATCHED, NOT RESTATED. `CREATE OR REPLACE` on this function would mean
-- retyping ~70 lines and would silently revert anything a concurrent session
-- has changed in it -- the trap `99991790719601` recorded on
-- `tag_hygiene_stats`. This file reads the live `pg_get_functiondef`, asserts
-- the exact shape it expects, substitutes the bound, and executes the result.
-- Live `prosrc` md5 before patching: 81a8d42c127c686cee8164430acaa026.

begin;

do $patch$
declare
  v_def  text;
  v_n500 int;
  v_new  text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'link_event_venues'
    and pg_get_function_identity_arguments(p.oid) = 'p_limit integer, p_active_only boolean, p_dry_run boolean';

  if v_def is null then
    raise exception 'link_event_venues(integer,boolean,boolean) not found — refusing to patch a shape I cannot see';
  end if;

  v_n500 := (length(v_def) - length(replace(v_def, 'distance_m < 500', ''))) / length('distance_m < 500');

  -- Idempotent: if the bound is already widened, do nothing rather than abort.
  -- A re-run must not red the repo (soft on preconditions).
  if v_n500 = 0
     and (length(v_def) - length(replace(v_def, 'distance_m < 100000', '')))
         / length('distance_m < 100000') = 2 then
    raise notice 'venue linker gate already at 100 km — no-op';
    return;
  end if;

  -- Hard on a shape I do not recognise: patching blind would corrupt the only
  -- function that auto-creates event→venue links.
  if v_n500 <> 2 then
    raise exception 'expected exactly 2 occurrences of "distance_m < 500", found % — '
      'the function shape changed; re-read pg_get_functiondef and re-author this patch', v_n500;
  end if;

  v_new := replace(v_def, 'distance_m < 500', 'distance_m < 100000');
  execute v_new;
end
$patch$;

-- ---------------------------------------------------------------------------
-- Postconditions. Asserted against the LIVE catalog, not against this file's
-- own text, because `execute` is what decides whether the patch took.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_def text;
  v_n   int;
  v_dry jsonb;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'link_event_venues';

  -- P1: the old bound is gone and the new one is in both the report pass and
  -- the write pass. One of two would mean the dry run and the UPDATE disagree.
  if position('distance_m < 500' in v_def) <> 0 then
    raise exception 'P1 failed: the 500 m bound survives in link_event_venues';
  end if;
  v_n := (length(v_def) - length(replace(v_def, 'distance_m < 100000', '')))
         / length('distance_m < 100000');
  if v_n <> 2 then
    raise exception 'P1 failed: expected the 100 km bound twice (report + write), found %', v_n;
  end if;

  -- P2: the signals that DO the corroborating are still required. Widening a
  -- bound must not have loosened the name match or the ambiguity veto.
  if position('name_exact AND' in v_def) = 0 then
    raise exception 'P2 failed: name_exact is no longer required for the auto path';
  end if;
  v_n := (length(v_def) - length(replace(v_def, 'HAVING count(*) = 1', '')))
         / length('HAVING count(*) = 1');
  if v_n <> 2 then
    raise exception 'P2 failed: the single-candidate veto must appear twice, found %', v_n;
  end if;

  -- P3: NULL distance still fails open, which is what the 6 coordinate-less
  -- pairs rely on.
  if position('distance_m IS NULL OR' in v_def) = 0 then
    raise exception 'P3 failed: a NULL distance no longer passes';
  end if;

  -- P4 (BEHAVIOURAL): a source-text check cannot tell a live gate from a dead
  -- one. Run the function's own dry run and require that the widened bound
  -- actually admits more than the 334 the 500 m gate did.
  v_dry := public.link_event_venues(2000, true, true);
  if (v_dry ->> 'linked')::int <= 334 then
    raise exception 'P4 failed: dry run still auto-links only % events (500 m gate gave 334) — '
      'the patch did not take effect', (v_dry ->> 'linked')::int;
  end if;
  if (v_dry ->> 'dry_run')::boolean is not true then
    raise exception 'P4 failed: the probe was not a dry run — it may have written';
  end if;

  raise notice 'venue linker gate widened to 100 km; dry run auto-links % of % candidates, % to review',
    v_dry ->> 'linked', v_dry ->> 'candidates', v_dry ->> 'queued_for_review';
end
$verify$;

commit;
