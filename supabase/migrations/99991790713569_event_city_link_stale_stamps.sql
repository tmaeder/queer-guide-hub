-- ============================================================================
-- A STAMPED FAILURE IS PERMANENT, AND THE CORPUS MOVED UNDER IT
-- ----------------------------------------------------------------------------
-- 813 live events carry a city name and no `city_id`. The largest cohort is not
-- a gap in `cities` — it is 219 events that HAVE an exact-name match in their own
-- country and are unlinked anyway, because `run_event_city_link` skips any row
-- already carrying an `event_city_link` stamp:
--
--     and (p_force or not (coalesce(e.enrichment_status,'{}'::jsonb) ? 'event_city_link'))
--
-- That "try once, not nightly" rule is deliberate and right — it stops the runner
-- re-deriving 40k unresolvable rows every night. Its cost is that a row judged
-- unresolvable STAYS unresolvable even after the thing that blocked it is fixed.
--
-- Every one of those 219 stamps dates 2026-08-01 .. 2026-08-09, i.e. the original
-- backfill pass — and the repairs that made these rows resolvable all landed
-- AFTER it: `20260801142627` (events.country mixed ISO2 country codes with US
-- state codes), `20260802090844` (the same-name guards), the city_aliases harvest,
-- the exonym merges, and the 246 hand-verified links of 99991790621307. So the
-- nightly cron has been correctly skipping 219 rows it would now resolve.
--
-- ── WHY THIS IS NOT `p_force => true` ───────────────────────────────────────
-- Forcing re-evaluates every unlinked row, and three of these city names resolve
-- to the WRONG city. The exact-name arm cannot tell, and neither can the guards,
-- because `cities` holds at most one row per (name, country) so an unrepresentable
-- twin looks identical to a genuinely unique name. Read from each event's own
-- source payload, not inferred:
--
--   Hammond   (7) → our only US row is Hammond, LOUISIANA. The events are
--                   Hammond, INDIANA: "Paul Henry's Art Gallery, 416 Sibley St,
--                   Hammond", "Fahrenheit 212 ... 10805 Broadway Crown Point, In
--                   46307", "THIS SATURDAY IN VALPO ON THE SQUARE ... fight
--                   HJR-6" (Valparaiso IN; HJR-6 was Indiana's marriage
--                   amendment), "Shenanigans in Portage".
--   Orange    (1) → our only US row is Orange, CONNECTICUT. The event is Orange,
--                   CALIFORNIA: titled "OE Bears Dinner at Lazy Dog Cafe -
--                   Orange, CA", address "1623 West Katella Ave. Orange CA 92867".
--   Milton    (2) → our only US row is Milton, PENNSYLVANIA. The events are
--                   Milton, DELAWARE: "Join the Milton Theatre ... Hosted by
--                   Magnolia Applebottom", a Delaware venue and performer. These
--                   two already carry state='Delaware', so guard A blocks them on
--                   its own; they are stamped here so the refusal is legible
--                   rather than incidental.
--
-- Hammond/Indiana, Orange/California and Milton/Delaware are ABSENT from `cities`
-- and cannot be added — `idx_cities_name_country_unique` is on (lower(name),
-- country_id). This is `College Park, Georgia` again: the correct city is
-- unrepresentable, so the correct answer is NO LINK, and a null `city_id` is
-- recoverable where a wrong one is not.
--
-- ── THE SEAL IS THE ROW'S OWN `state`, NOT A STAMP ──────────────────────────
-- A stamp cannot hold: `p_force => true` ignores it by definition. What holds is
-- `events.state`, because guard A refuses on `regions_contradict(state,
-- region_name)` and that is re-derived on every run, forced or not. Verified live
-- before writing: regions_contradict('Indiana','Louisiana'),
-- ('California','Connecticut') and ('Delaware','Pennsylvania') are all TRUE,
-- while ('Texas','Texas'), ('Virginia','Virginia') and (null,'Louisiana') are
-- FALSE — so the seal blocks exactly these and nothing else.
--
-- Writing `state` is also just true: these events ARE in Indiana and California,
-- and the column was null. CLAUDE.md records that `events.state` is near-random
-- across this corpus; this sets two values from explicit evidence.
--
-- ── WHAT IS RELEASED, AND THE SECOND SIGNAL THAT BOUNDS IT ──────────────────
-- 210 events across 17 city names. Each name was read individually; the residual
-- risk of the exact-name arm is a same-name twin, so each is corroborated by
-- something OTHER than the name:
--
--   Atlantic City NJ 46   unique US name, slug `atlanticcity`
--   Toledo OH        28   description names Ohio; slug `toledo`
--   Galveston TX     26   description names Texas
--   Victoria BC      26   "Victoria, BC's first queer performance festival —
--                         OUTstages", Sugar Nightclub 858 Yates St, Hermann's
--                         Jazz Club, blueprintevents.ca  (the stray "Australia"
--                         match in a description scan was incidental)
--   Youngstown OH    18   description names Ohio
--   Stamford CT      16   description names Connecticut
--   Green Bay WI     14   unique US name
--   Longview TX       8   "Best Bartenders ... In Texas", "Rmc Longview at Miss
--                         Gay Texas America", "East Texas Best Foam Party"
--   Fort Wayne IN     7   unique US name
--   Sioux Falls SD    5   unique US name
--   Santa Fe NM       5   dominant US Santa Fe
--   Santa Cruz CA     3   only US Santa Cruz
--   Santa Rosa CA     2   only US Santa Rosa
--   Roanoke VA        2   "The Park in Roanoke, Virginia", "Mr Virginia
--                         Unlimited Bear and Cub"
--   San José CR       2   slug `sanjosecr` names the country outright
--   River Edge NJ     1   unique US name
--   Windsor (CA)      1   "WINDSOR PRIDE COMMUNITY", "The Loop (156 Chatham St.
--                         W.)", "19+ event" — Ontario; population 210,891 matches
--
-- The release is a stamp DELETION, not a link: the rows become eligible and the
-- shipped, guarded `run_event_city_link` does the work, so guards A and B still
-- apply and nothing here reimplements them. The set is pinned by (city, country,
-- EXPECTED region) rather than an id list, so if `cities` has moved since this was
-- measured the row simply does not match and is not released — the migration
-- cannot link a city it did not verify.
--
-- Coordinates could not be used as the corroborating signal and that is not an
-- oversight: 218 of the 219 have none, because `run_event_geo_fill` derives
-- coordinates FROM the city centroid after linking. Their absence is a consequence
-- of being unlinked, so using it as evidence would be circular.
--
-- ── NOT FIXED HERE, AND WHY ─────────────────────────────────────────────────
-- 344 events name a city absent from `cities` entirely (needs city rows, each its
-- own decision); 136 are guard-blocked, which is the guards working; 62 have no
-- `country_id` so nothing can be scoped; 31 match an alias that
-- 99991790621307's de-qualification rule correctly refuses (Springfield,
-- Schwerin, Ludwigshafen); 17 name a city that exists only in another country.
--
-- Also NOT sealed against: `geo-link-content` (cron `wf-geo-link-content`, hourly
-- at :30, batch 200) is a second writer of `events.city_id` that resolves by name.
-- Hammond, Orange and Milton are each globally unique in `cities`, so its resolver
-- could link them; empirically it has not in ~1,400 runs since August, but that is
-- absence of evidence. The `state` seal is what makes THIS runner refuse; that
-- producer is a separate, pre-existing gap and is named rather than implied away.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seal the three wrong-city cohorts BEFORE anything is released.
-- ----------------------------------------------------------------------------
update public.events e
set state = 'Indiana',
    needs_attention = true,
    enrichment_status = jsonb_set(
      coalesce(e.enrichment_status, '{}'::jsonb), '{event_city_link}',
      jsonb_build_object(
        'at', now(), 'linked', false, 'by', 'migration:99991790713569',
        'blocked', 'same-name-city collision; gaycities hammond.* is Hammond, INDIANA '
                || '(Crown Point IN address, Valparaiso/HJR-6 rally, Portage) and the only '
                || 'US Hammond in cities is Hammond, LOUISIANA. Hammond, Indiana is '
                || 'unrepresentable under idx_cities_name_country_unique, so no link.'), true)
where e.duplicate_of_id is null
  and e.city_id is null
  and lower(btrim(e.city)) = 'hammond'
  and e.country_id = (select id from public.countries where code = 'US')
  and coalesce(btrim(e.state), '') = '';

update public.events e
set state = 'California',
    needs_attention = true,
    enrichment_status = jsonb_set(
      coalesce(e.enrichment_status, '{}'::jsonb), '{event_city_link}',
      jsonb_build_object(
        'at', now(), 'linked', false, 'by', 'migration:99991790713569',
        'blocked', 'same-name-city collision; the event names itself "Orange, CA" '
                || '(1623 West Katella Ave, Orange CA 92867) and the only US Orange in '
                || 'cities is Orange, CONNECTICUT. Orange, California is unrepresentable '
                || 'under idx_cities_name_country_unique, so no link.'), true)
where e.duplicate_of_id is null
  and e.city_id is null
  and lower(btrim(e.city)) = 'orange'
  and e.country_id = (select id from public.countries where code = 'US')
  and coalesce(btrim(e.state), '') = '';

-- Milton already carries state='Delaware', which guard A acts on. Only the stamp
-- is written, so the refusal is legible instead of incidental. `state` is NOT
-- touched: it is already correct and this file does not rewrite correct data.
update public.events e
set needs_attention = true,
    enrichment_status = jsonb_set(
      coalesce(e.enrichment_status, '{}'::jsonb), '{event_city_link}',
      jsonb_build_object(
        'at', now(), 'linked', false, 'by', 'migration:99991790713569',
        'blocked', 'same-name-city collision; the Milton Theatre with Magnolia '
                || 'Applebottom is Milton, DELAWARE (the row says so in events.state) '
                || 'and the only US Milton in cities is Milton, PENNSYLVANIA. Milton, '
                || 'Delaware is unrepresentable under idx_cities_name_country_unique, '
                || 'so no link.'), true)
where e.duplicate_of_id is null
  and e.city_id is null
  and lower(btrim(e.city)) = 'milton'
  and e.country_id = (select id from public.countries where code = 'US')
  and lower(btrim(coalesce(e.state, ''))) = 'delaware';

-- ----------------------------------------------------------------------------
-- 2. Release the verified 210 by DELETING their stale stamp, so the normal
--    guarded runner reconsiders them. Nothing here writes city_id.
-- ----------------------------------------------------------------------------
with verified(city, cc, region) as (values
  ('Atlantic City', 'US', 'New Jersey'),
  ('Toledo',        'US', 'Ohio'),
  ('Galveston',     'US', 'Texas'),
  ('Victoria',      'CA', 'British Columbia'),
  ('Youngstown',    'US', 'Ohio'),
  ('Stamford',      'US', 'Connecticut'),
  ('Green Bay',     'US', 'Wisconsin'),
  ('Longview',      'US', 'Texas'),
  ('Fort Wayne',    'US', 'Indiana'),
  ('Sioux Falls',   'US', 'South Dakota'),
  ('Santa Fe',      'US', 'New Mexico'),
  ('Santa Cruz',    'US', 'California'),
  ('Santa Rosa',    'US', 'California'),
  ('Roanoke',       'US', 'Virginia'),
  ('San José',      'CR', 'San Jose Province'),
  ('River Edge',    'US', 'New Jersey'),
  -- region_name is NULL on this row; `is not distinct from` is what makes the
  -- corroboration test survive that rather than silently dropping the row.
  ('Windsor',       'CA', null)
),
target as (
  select e.id
  from verified v
  join public.countries co on co.code = v.cc
  join public.cities c
    on c.country_id = co.id
   and c.duplicate_of_id is null
   and lower(btrim(c.name)) = lower(btrim(v.city))
   and c.region_name is not distinct from v.region
  join public.events e
    on e.duplicate_of_id is null
   and e.city_id is null
   and e.country_id = co.id
   and lower(btrim(e.city)) = lower(btrim(v.city))
   and coalesce(e.enrichment_status, '{}'::jsonb) ? 'event_city_link'
   and e.enrichment_status->'event_city_link'->>'blocked' is null
)
update public.events e
set enrichment_status = e.enrichment_status - 'event_city_link'
where e.id in (select id from target);

-- ----------------------------------------------------------------------------
-- 3. Let the shipped runner link them. p_force stays FALSE: only the rows
--    released above (plus any never-attempted row) are eligible, so this cannot
--    reach the sealed cohorts or re-stamp the ~600 rows this file is not about.
-- ----------------------------------------------------------------------------
select public.run_event_city_link(300, false);
select public.run_event_city_link(300, false);

-- ----------------------------------------------------------------------------
-- Postconditions. Assert the REACHED STATE, not the number of rows updated: a
-- re-run legitimately updates nothing, so counting writes proves nothing.
-- ----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_us uuid;
  v_bad int;
  v_linked int;
  v_name text;
BEGIN
  SELECT id INTO v_us FROM public.countries WHERE code = 'US';

  -- P1: none of the three wrong cohorts may have acquired a city_id.
  SELECT count(*) INTO v_bad
  FROM public.events e
  WHERE e.duplicate_of_id IS NULL
    AND e.country_id = v_us
    AND lower(btrim(e.city)) IN ('hammond', 'orange', 'milton')
    AND e.city_id IS NOT NULL;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'P1: % event(s) in the Hammond/Orange/Milton cohorts were linked', v_bad;
  END IF;

  -- P2: and the seal that keeps it that way is the row's own state, so guard A
  -- must genuinely contradict for every one of them. A stamp alone would not
  -- survive p_force.
  SELECT count(*) INTO v_bad
  FROM public.events e
  JOIN public.cities c
    ON c.country_id = v_us AND c.duplicate_of_id IS NULL
   AND lower(btrim(c.name)) = lower(btrim(e.city))
  WHERE e.duplicate_of_id IS NULL
    AND e.country_id = v_us
    AND lower(btrim(e.city)) IN ('hammond', 'orange', 'milton')
    AND NOT public.regions_contradict(e.state, c.region_name);
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'P2: % row(s) are not sealed — guard A does not contradict', v_bad;
  END IF;

  -- P3: the released cohort must actually be linked now. Asserted as a floor
  -- rather than exactly 210, because a concurrent nightly run may legitimately
  -- have linked some already and because one row losing its match in `cities`
  -- between measurement and apply is a skip, not a failure.
  SELECT count(*) INTO v_linked
  FROM public.events e
  JOIN public.countries co ON co.id = e.country_id
  WHERE e.duplicate_of_id IS NULL
    AND e.city_id IS NOT NULL
    AND (co.code, lower(btrim(e.city))) IN (
      ('US','atlantic city'), ('US','toledo'), ('US','galveston'), ('CA','victoria'),
      ('US','youngstown'), ('US','stamford'), ('US','green bay'), ('US','longview'),
      ('US','fort wayne'), ('US','sioux falls'), ('US','santa fe'), ('US','santa cruz'),
      ('US','santa rosa'), ('US','roanoke'), ('CR','san josé'), ('US','river edge'),
      ('CA','windsor'));
  IF v_linked < 200 THEN
    RAISE EXCEPTION 'P3: only % of the verified cohort is linked (expected >= 200)', v_linked;
  END IF;

  -- P4: every one of those links must land on the city whose name the event
  -- itself carries. This is the cheap check that the runner did not resolve
  -- something adjacent, and it is why the release is keyed on the name.
  SELECT count(*) INTO v_bad
  FROM public.events e
  JOIN public.cities c ON c.id = e.city_id
  JOIN public.countries co ON co.id = e.country_id
  WHERE e.duplicate_of_id IS NULL
    AND (co.code, lower(btrim(e.city))) IN (
      ('US','atlantic city'), ('US','toledo'), ('US','galveston'), ('CA','victoria'),
      ('US','youngstown'), ('US','stamford'), ('US','green bay'), ('US','longview'),
      ('US','fort wayne'), ('US','sioux falls'), ('US','santa fe'), ('US','santa cruz'),
      ('US','santa rosa'), ('US','roanoke'), ('CR','san josé'), ('US','river edge'),
      ('CA','windsor'))
    AND lower(btrim(c.name)) <> lower(btrim(e.city));
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'P4: % released event(s) linked to a city of a different name', v_bad;
  END IF;

  -- P5: a positive control on the corroboration, not just on the count. Toledo
  -- must be Ohio's and Victoria must be British Columbia's — the two names in the
  -- set with the most plausible wrong answers (Toledo ES/BR, Victoria SC).
  SELECT c.region_name INTO v_name
  FROM public.events e JOIN public.cities c ON c.id = e.city_id
  WHERE e.duplicate_of_id IS NULL AND lower(btrim(e.city)) = 'toledo'
    AND e.country_id = v_us AND e.city_id IS NOT NULL LIMIT 1;
  IF v_name IS DISTINCT FROM 'Ohio' THEN
    RAISE EXCEPTION 'P5: Toledo linked to region % (expected Ohio)', coalesce(v_name, '<null>');
  END IF;
  SELECT c.region_name INTO v_name
  FROM public.events e JOIN public.cities c ON c.id = e.city_id
  WHERE e.duplicate_of_id IS NULL AND lower(btrim(e.city)) = 'victoria'
    AND e.country_id = (SELECT id FROM public.countries WHERE code = 'CA')
    AND e.city_id IS NOT NULL LIMIT 1;
  IF v_name IS DISTINCT FROM 'British Columbia' THEN
    RAISE EXCEPTION 'P5: Victoria linked to region % (expected British Columbia)',
      coalesce(v_name, '<null>');
  END IF;

  RAISE NOTICE 'released cohort linked: %; Hammond/Orange/Milton sealed by guard A', v_linked;
END $verify$;
