-- Clear one wrong Wikidata identifier the restored city_qid_gap_link engine adopted.
--
-- WHAT HAPPENED
-- The qid_gap sweep ran live on 2026-09-16/17/18 and adopted 29 identifiers.
-- All 29 were checked against wbgetentities by request; 28 are right, including
-- the exonyms the engine exists for (Damaskus -> Damascus 1.6 km, Ahwaz ->
-- Ahvaz 1.7 km). One is wrong:
--
--   city 46fa9926-2131-45ab-965c-4dcbb26034bf  "Kowloon, Hongkong"  (HK)
--   adopted Q1022918 = KOWLOON WALLED CITY
--
-- The Walled City was demolished in 1994. It occupied ~2.6 hectares inside
-- Kowloon City district. The row represents Kowloon, the urban area of roughly
-- two million people. They are not the same place.
--
-- WHY NO GUARD CAUGHT IT, AND WHY NONE CAN
-- All three arms pass, correctly:
--   * coordinates  1.9 km from the row's own point -- the coordinate arm exists
--                  for DISTANT namesakes (Long Island -> Kansas at 2216.1 km),
--                  and a contained entity is by definition nearby;
--   * class        P31 = Q486972 "human settlement" -- a genuine settlement
--                  class, so the whitelist has nothing to object to;
--   * name         the entity label contains the row's own name.
-- This is the namesake problem INVERTED: not a distant place sharing a name,
-- but a nearby, narrower, contained one. No coordinate bound and no class
-- vocabulary can separate it. That defect class is recorded and NOT fixed here;
-- a containment guard needs its own measurement.
--
-- THE HARM WAS PENDING, NOT LANDED, AND THE CACHED TITLE IS THE MECHANISM
-- cities.description still holds correct Kowloon prose ("one of the three areas
-- of Hong Kong ... population of 2,019,533"). But wikipedia_title was
-- overwritten to "Kowloon Walled City", and city-factual-backfill fetches
-- Wikipedia BY CACHED SITELINK TITLE, never by cities.name. So the next weekly
-- city_factual_sparql / city-corroboration pass rebuilds from the wrong entity
-- and can replace correct prose with the Walled City's.
--
-- Clearing the QID alone would therefore leave the defect live. This is the
-- queerness rule (20360401100300) on a third entity class: nulling an
-- identifier does not unpublish the prose it produced -- and here, inversely,
-- leaving the cached TITLE keeps producing it.
--
-- NO REPOINT, AND THE REASON IS NOT ABSTRACT
-- Repo convention is to NULL an identifier rather than repoint it, because a
-- plausible-but-wrong QID regenerates wrong data forever while a null one
-- regenerates nothing. Writing this migration tested that rule: Q216651 was
-- recalled as "the correct Kowloon" and resolved live before being written --
-- it is ATMEL AVR, a family of microcontrollers. The correct identifier for
-- this row is NOT established here and is deliberately left unset. A human, or
-- a deliberate relink, can set it; this file will not guess one.
--
-- WHY THE TERMINAL STATE IS PART OF THE FIX
-- A bare null returns the row to the qid_gap cohort, where the same three
-- guards pass and the same wrong entity is adopted again -- the marketplace
-- rejection treadmill, one table over. cities_due_for_refresh excludes
-- enrichment_status->'wikidata_link'->>'state' = 'data_unavailable' in its
-- scope CTE, i.e. for EVERY scope, so that state is what stops the re-adoption.
-- The label is the mechanism that exists rather than a precise description of
-- what happened, so the real reason is recorded alongside it in the same
-- object. Reversible: reset_city_enrichment_state() clears it.
--
-- The cost is that this row is also skipped by content_first, so it gains no
-- further facts. It is a placeholder shell: tmp- slug, data_source
-- personality-birth-place, 0 venues, 0 events, seo_indexable false. Its
-- description is already correct. That is the trade, stated rather than hidden.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. The UPDATE is content-guarded
-- on the wrong QID, so a repair by another session leaves it a no-op, and every
-- postcondition is keyed on the DEFECT being gone rather than on this file's
-- own wording -- so a better fix written by someone else satisfies them too.

do $$
declare
  v_city_id  constant uuid := '46fa9926-2131-45ab-965c-4dcbb26034bf';
  v_bad      int;
  v_offered  int;
  v_pool     int;
begin
  perform set_config('app.actor', 'migration:city_kowloon_wrong_qid', true);

  update public.cities c
     set wikidata_qid    = null,
         wikipedia_title = null,
         enrichment_status =
           coalesce(c.enrichment_status, '{}'::jsonb)
           || jsonb_build_object(
                'wikidata_link',
                coalesce(c.enrichment_status->'wikidata_link', '{}'::jsonb)
                || jsonb_build_object(
                     'state',                   'data_unavailable',
                     'reason',                  'wrong_entity_contained',
                     'detail',                  'Q1022918 is Kowloon Walled City, demolished 1994, contained within Kowloon; the class and coordinate guards both pass on it. No correct identifier established.',
                     'cleared_qid',             'Q1022918',
                     'cleared_wikipedia_title', 'Kowloon Walled City',
                     'by',                      'migration:city_kowloon_wrong_qid',
                     'at',                      now()
                   ))
   where c.id = v_city_id
     and c.wikidata_qid = 'Q1022918';

  -- 1. The wrong identifier is gone corpus-wide, not merely off this row.
  select count(*) into v_bad
    from public.cities
   where wikidata_qid = 'Q1022918';
  if v_bad <> 0 then
    raise exception 'city_kowloon_wrong_qid: % row(s) still carry Q1022918', v_bad;
  end if;

  -- 2. The cached sitelink title is gone too. Clearing the QID without this
  --    leaves the actual publishing mechanism intact.
  select count(*) into v_bad
    from public.cities
   where wikipedia_title = 'Kowloon Walled City';
  if v_bad <> 0 then
    raise exception 'city_kowloon_wrong_qid: % row(s) still cache the Walled City title', v_bad;
  end if;

  -- 3. The correct prose SURVIVED. "The wrong identifier is gone" is equally
  --    satisfied by a pass that blanked the row, which would be worse.
  select count(*) into v_bad
    from public.cities
   where id = v_city_id
     and (description is null
          or btrim(description) = ''
          or description ilike '%Walled City%');
  if v_bad <> 0 then
    raise exception 'city_kowloon_wrong_qid: the Kowloon description is missing or now describes the Walled City';
  end if;

  -- 4. The row is no longer offered to the qid_gap sweep, so it cannot
  --    re-adopt the same entity. The pool count is a positive control: an
  --    empty result set would satisfy "the row is absent" while proving
  --    nothing.
  select count(*) into v_pool   from public.cities_due_for_refresh(1000, 'qid_gap');
  select count(*) into v_offered from public.cities_due_for_refresh(1000, 'qid_gap') r
   where r.id = v_city_id;
  if v_pool = 0 then
    raise exception 'city_kowloon_wrong_qid: qid_gap selector returned nothing - cannot prove the row was excluded';
  end if;
  if v_offered <> 0 then
    raise exception 'city_kowloon_wrong_qid: the row is still offered by the qid_gap selector';
  end if;

  -- 5. Mirror check on rows OUTSIDE this repair. The same cron run adopted
  --    these three correctly - they are the false refusals the coordinate fix
  --    was built to rescue - so a sweep that cleared identifiers broadly would
  --    fail here while passing check 1.
  select count(*) into v_bad
    from (values ('Q4970'), ('Q58401'), ('Q179608')) as keep(qid)
   where not exists (select 1 from public.cities c where c.wikidata_qid = keep.qid);
  if v_bad <> 0 then
    raise exception 'city_kowloon_wrong_qid: % correctly-adopted identifier(s) were destroyed', v_bad;
  end if;
end $$;
