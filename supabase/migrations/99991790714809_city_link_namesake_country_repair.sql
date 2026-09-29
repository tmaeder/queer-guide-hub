-- Quarantining a namesake mislink clears the city link and LEAVES the data it derived
-- from the wrong city.
--
-- FOUND WHILE the two city-link zero-invariants were red. `city_quality_scorecard`
-- carries CITY_LINK_NAMESAKE and CITY_LINK_COUNTRY_MISMATCH as zero-invariants
-- (99991790194100:343-345); both went non-zero and red every open PR in the repo.
-- Three upcoming events were the cause:
--   CSD Burgdorf              event DE, linked to `burgdorf` (CH)
--   tri-Pride 2027            event CA, linked to `cambridge-gb-2wpbj` (GB)
--   Hong Kong Gay pride 2026  event CN, linked to the real `hong-kong-hk-2hvf2` (HK)
--
-- THE PLATFORM REPAIRED ALL THREE ON ITS OWN WHILE THIS WAS BEING WRITTEN, and that
-- is why this migration is one row instead of three. `run_event_city_link` (cron
-- `5 3 * * *`) ran at 03:05 and unlinked both mislinks with
-- `enrichment_status.event_city_link.blocked = 'namesake_across_border'`, and Hong
-- Kong's country reached HK. Re-measured after: both invariants are 0. A migration
-- repairing them would have changed nothing and reported that it had.
--
-- WHAT THE GUARD DOES NOT CLEAR IS THE DERIVED DATA. tri-Pride 2027 is the annual
-- Pride festival of Ontario's Waterloo Region (its own description, tri-pride.ca,
-- venue Victoria Park) and was linked to Cambridge, ENGLAND. `run_event_geo_fill`
-- had already stamped it with that city's timezone, `Europe/London`. The unlink
-- cleared `city_id` and left the timezone standing, so the row now advertises a
-- Canadian festival in British time. This is the rule this repo records for
-- identifiers and prose -- clearing the pointer does not unpublish what the pointer
-- produced -- one datum class further on.
--
-- NOTHING ELSE WILL FIX IT. `run_event_timezone_fill` only ever fills NULLs
-- (20260801180253), so a non-null wrong timezone is permanent, and the row has no
-- `city_id` left for any linker to re-derive from.
--
-- SCOPED TO WHAT IS PROVABLE, WHICH IS ONE ROW OF TWENTY-ONE. 138 events are
-- quarantined with a `blocked` stamp and 21 still carry a timezone. Only rows whose
-- timezone sits in a DIFFERENT tz region than their own country's
-- (`countries.timezone`) are mechanically wrong, and that is exactly one: tri-Pride,
-- `Europe/London` against `America/Toronto`. The other 20 are all `America/*` on US
-- events -- possibly derived from the wrong same-name city (several are `Portland`,
-- where ME is America/New_York and OR is America/Los_Angeles) but NOT provably wrong
-- from the row, because America/New_York is also simply correct for a Georgia or Ohio
-- event. Under-reaching is the correct error here: a wrong timezone published with
-- confidence is worse than a null, and a null on a row that was right is a
-- regression. They are left alone and named rather than swept.
--
-- CLEARED, NOT CORRECTED. `America/Toronto` is almost certainly right for Waterloo
-- Region, but this file does not write it: the row has no city link to corroborate
-- against, `countries.timezone` for CA is `America/Toronto` only because Canada is
-- listed by its most populous zone (CA spans six), and CLAUDE.md already records that
-- a blanket country->timezone fallback is what would mislabel every Pacific-coast
-- row. Prefer NULL to a guess; `run_event_timezone_fill` fills it correctly once a
-- real city link exists, and its 250 km nearest-city rule was measured at 99.71%
-- agreement.
--
-- This does NOT seal the producer. The guard should clear what it derived when it
-- unlinks, and it does not; that is a change to `run_event_city_link` with its own
-- blast radius over 138 rows, recorded here and in the PR as the follow-up rather
-- than bundled into a one-row repair.

-- No `set local statement_timeout`: a documented no-op under `db push`, one row by id.

update public.events e
set timezone   = null,
    updated_at = now(),
    -- `||`, never jsonb_set(create_missing): that creates only the LAST path element,
    -- so on a row with no `event_city_link` key it would write nothing and the
    -- record would be lost silently while the row read repaired.
    enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb)
      || jsonb_build_object('event_city_link',
           coalesce(e.enrichment_status->'event_city_link', '{}'::jsonb)
             || jsonb_build_object(
                  'stale_timezone_cleared', 'Europe/London',
                  'reason', 'Derived from Cambridge, GB before run_event_city_link '
                         || 'quarantined the namesake mislink. tri-Pride is in Ontario''s '
                         || 'Waterloo Region. Cleared rather than set to America/Toronto '
                         || 'because nothing on the row corroborates a zone and Canada '
                         || 'spans six; run_event_timezone_fill will derive it once a '
                         || 'real city link exists.',
                  'at', now(),
                  'by', 'migration:99991790714809'))
where e.id = 'e2ca4bd7-6a04-41a1-a651-245eb04d466b'::uuid
  -- Soft on preconditions. If a sibling session or a cron cleared it first this
  -- no-ops rather than aborting `db push` for the whole repo.
  and e.timezone = 'Europe/London';

do $verify$
declare
  v_cleared      int;
  v_recorded     int;
  v_contradict   int;
  v_control_kept int;
  v_still_null   int;
  v_city_text    int;
begin
  -- Positive form: the reached state, not a count of bad rows, which returns zero for
  -- a row that has gone missing from the corpus entirely.
  select count(*) into v_cleared
    from public.events
   where id = 'e2ca4bd7-6a04-41a1-a651-245eb04d466b' and timezone is null;

  select count(*) into v_recorded
    from public.events
   where id = 'e2ca4bd7-6a04-41a1-a651-245eb04d466b'
     and enrichment_status->'event_city_link'->>'stale_timezone_cleared' = 'Europe/London';

  -- The invariant this exists to hold: no quarantined event carries a timezone from a
  -- different tz region than its own country. Asserts the CONDITION, corpus-wide, so a
  -- future guard that leaves another one behind fails here.
  select count(*) into v_contradict
    from public.events e join public.countries co on co.id = e.country_id
   where e.duplicate_of_id is null and e.city_id is null
     and e.enrichment_status->'event_city_link'->>'blocked' is not null
     and e.timezone is not null and co.timezone is not null
     and split_part(e.timezone, '/', 1) is distinct from split_part(co.timezone, '/', 1);

  -- CONTROL: the 20 within-region timezones are deliberately NOT swept. A migration
  -- that nulled every quarantined timezone would satisfy every assertion above.
  select count(*) into v_control_kept
    from public.events e
   where e.duplicate_of_id is null and e.city_id is null
     and e.enrichment_status->'event_city_link'->>'blocked' is not null
     and e.timezone is not null;

  -- CONTROL: the city TEXT survives. It is the evidence a future correct link needs.
  select count(*) into v_city_text
    from public.events
   where id = 'e2ca4bd7-6a04-41a1-a651-245eb04d466b'
     and nullif(btrim(city), '') is not null;

  -- CONTROL: the row stays unlinked. This file must not re-link it to anything.
  select count(*) into v_still_null
    from public.events
   where id = 'e2ca4bd7-6a04-41a1-a651-245eb04d466b' and city_id is null;

  if v_cleared <> 1 then
    raise exception 'tri-Pride still carries a timezone';
  end if;
  if v_recorded <> 1 then
    raise exception 'the cleared value was not recorded -- the repair destroyed it instead of retracting it';
  end if;
  if v_contradict <> 0 then
    raise exception '% quarantined event(s) still carry a cross-region timezone', v_contradict;
  end if;
  if v_control_kept < 15 then
    raise exception 'only % quarantined timezones survive -- the repair swept the unprovable rows (expected ~20)', v_control_kept;
  end if;
  if v_city_text <> 1 then
    raise exception 'tri-Pride lost its city text -- the evidence for a future link is gone';
  end if;
  if v_still_null <> 1 then
    raise exception 'tri-Pride was re-linked to a city -- this file must not do that';
  end if;

  raise notice 'stale timezone cleared: 1 row, cross-region contradictions 0, % within-region timezones correctly left alone', v_control_kept;
end
$verify$;
