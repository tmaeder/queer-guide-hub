-- Twelve events are presented on a city they are nowhere near. The remedy is NOT the
-- same for all twelve, and establishing that per row is the whole of this file.
--
-- 99970901120000 (#3791) repaired two such events; 99991789843667 (#3828) repaired a
-- third and created Derby, England. Each was found by following ONE row. The sweep
-- behind this file is mechanical instead -- every live event more than 250 km from the
-- city it is linked to -- and it returns TWELVE, every one of them the same
-- `events.city = cities.name` name-only shape, with the previously-repaired rows now
-- absent from it because they were repaired. Salisbury, the row this pass was opened
-- for, ranks NINTH by distance. The brief said it was the last one; it is one of nine
-- still live, and four rows are between two and seven THOUSAND kilometres out.
--
-- NONE of the twelve carries a prior `event_city_link` stamp, so none is a producer
-- re-break of an earlier repair. They are originals that no pass had reached.
--
-- ---------------------------------------------------------------------------------
-- THE REMEDY DIFFERS BY ROW AND THE EVIDENCE DECIDES, NOT THE DISTANCE.
-- ---------------------------------------------------------------------------------
-- Sorting by distance and applying one fix would have damaged two rows. Both were
-- caught by reading each event's own source payload and description rather than
-- trusting the sweep's framing:
--
--   "Girls in Wonderland" is 8,526 km from its city and is the WORST-looking row in
--   the sweep. Its city link is CORRECT. Its own description reads "taking place ...
--   in St. Pete Beach, Florida", its source is stpetersburg.gaycities.com, and the
--   coordinates -- 59.94 / 30.30, Saint Petersburg, RUSSIA -- came verbatim from the
--   scraped payload's own lat/lng. Unlinking it, which is what its distance argues
--   for, would have detached a correctly-placed Florida event; creating a Russian
--   city row for it and moving it there, which is what the original brief proposed,
--   would have published a Florida pride event as Russian.
--
--   "PIANA PARTY / FOAM PARTY" is linked to the real Łódź, Poland and that link is
--   also correct. Its source payload carries `lat: null, lng: null, city: "Łódź",
--   country: "PL"` -- so its coordinates are not from the source at all. They are
--   50.743110 / 25.318991, which is byte-identical to the centroid of a SECOND Łódź
--   row (slug `od`, region "Volyn Oblast", UKRAINE) that has since been merged away.
--   Its timezone is "Europe/Kiev" while its city's is "Europe/Warsaw". The event was
--   stamped from the wrong row by the centroid fill, the merge moved the LINK, and
--   the derived fields were left behind pointing at a dead row in another country.
--
-- So the third remedy this pass was scoped for -- create a city row -- is written by
-- nobody here: its only candidate dissolved on the evidence. What replaced it is a
-- group that keeps the link and retracts the contradicted derivation instead.
--
-- ---------------------------------------------------------------------------------
-- GROUP A -- BLOCK (8 events). Same country, and `cities` holds at most one row per
-- (name, country): three unique indexes plus the BEFORE trigger
-- `trg_cities_aa_split_name` -> cities_split_qualified_name(), which strips a comma
-- qualifier before the index ever sees it. 99991789843667 established this by running
-- the INSERT and reading the 23505. So Portland MAINE, Lakewood OHIO, Arlington TEXAS,
-- Salisbury MASSACHUSETTS, Sanford FLORIDA and Milton DELAWARE are not merely absent,
-- they are unrepresentable, exactly as College Park, Georgia and Roseville, Minnesota
-- were. DO NOT work around this with a parenthesised or otherwise mangled name: it
-- re-creates the duplicate the split trigger exists to stop, under a spelling no
-- resolver will ever match. Representing them needs the region in the uniqueness key,
-- which is a schema change across ~5,700 rows and is deliberately not smuggled in here.
--
-- BLOCK rather than guess, per 20260802090844: a null city_id is recoverable and a
-- wrong one is not.
--
-- BOTH SIGNALS ARE REQUIRED AND THE STATE TEXT ALONE COULD NOT CARRY IT.
-- 99991789843667 measured `venues.state` to be near-random on this corpus -- a Taos
-- venue saying Alabama, a Panama duty-free saying Michigan. `events.state` is better
-- but is not evidence on its own, so every row below is additionally required to sit
-- within 25 km of the place its state text names. All eight satisfy both; a row that
-- satisfied only one would be declined by the predicate rather than judged by hand.
--
-- GROUP B -- RELINK (2 events). Unlike group A these ARE representable, because the
-- collision crosses a border, and the correct row ALREADY EXISTS -- so nothing is
-- created here either:
--   Birmingham, Alabama (Q79867, `birmingham-us-78ymh`)  2.03 km from its event
--   Cambridge, Massachusetts (Q49111, `cambridge`)        1.04 km from its event
-- Both events also carry `country = 'GB'`, itself derived from the wrong city;
-- `trg_events_geo_derive` re-derives it on relocation, which the postconditions check
-- rather than assume.
--
-- GROUP C -- RETRACT THE CONTRADICTED DERIVATION, KEEP THE LINK (2 events). Prefer
-- NULL to a guess: the coordinates are removed, not corrected to a centroid, and the
-- link that is right is left alone. `trg_event_geocode` fires only WHEN city_id IS
-- NULL, so these rows -- which keep their city -- do not enqueue a re-geocode; the
-- nightly geo and timezone fills re-derive from the correct city. Nulls pass
-- `coerce_null_island_coords` untouched (it acts only on 0,0).
--
-- Soft on preconditions, hard on postconditions: every write is guarded on the defect
-- it removes, so a concurrent repair is skipped rather than aborting `db push`
-- repo-wide. The postconditions assert the REACHED STATE positively, and the mirrors
-- are taken as a before/after SNAPSHOT rather than as a remembered count -- "the event
-- is unlinked" is equally satisfied by a sweep that emptied the row, and a mirror
-- written as a literal from a dated measurement is a postcondition that rots.

begin;

-- ---------------------------------------------------------------------------
-- 0. Snapshot. Taken BEFORE any write so the postconditions can state what this
--    migration MOVED rather than what the corpus happens to look like afterwards.
-- ---------------------------------------------------------------------------
create temporary table _ns_before on commit drop as
select id, city_id, latitude, longitude, timezone, country
  from public.events
 where duplicate_of_id is null;

create temporary table _ns_pers_before on commit drop as
select city_id, count(*) as n
  from public.personalities
 where city_id is not null
 group by city_id;

-- The twelve, with the facts that corroborate each one. `true_lat`/`true_lon` is the
-- place the event's own state text names -- the independent second signal.
create temporary table _ns_plan on commit drop as
select * from (values
  -- group A: block. (event_id, state, true_lat, true_lon, wrong city, note)
  ('39fe5af6-7d44-401d-8c0b-41020fb5eeed'::uuid, 'Maine',         43.6591::numeric, -70.2568::numeric, 'Portland, Oregon',       'A'),
  ('e223aa71-3edf-4ead-b46a-afc12c040344'::uuid, 'Ohio',          41.4820::numeric, -81.7982::numeric, 'Lakewood, Colorado',     'A'),
  ('f21efc92-11d5-4774-846b-e769b95abb3a'::uuid, 'Ohio',          41.4820::numeric, -81.7982::numeric, 'Lakewood, Colorado',     'A'),
  ('15560889-b4bf-49f9-a584-13709c565f4d'::uuid, 'Ohio',          41.4820::numeric, -81.7982::numeric, 'Lakewood, Colorado',     'A'),
  ('77bcbdab-b20d-4f7d-a87e-de14f05bd18a'::uuid, 'Texas',         32.7357::numeric, -97.1081::numeric, 'Arlington, Virginia',    'A'),
  ('0d3a2d4c-d470-458b-9f04-641f4721ce6f'::uuid, 'Massachusetts', 42.8418::numeric, -70.8606::numeric, 'Salisbury, North Carolina', 'A'),
  ('7bee9d1f-f908-47c6-9220-e5796f1d6cd5'::uuid, 'Florida',       28.8003::numeric, -81.2731::numeric, 'Sanford, North Carolina','A'),
  ('f4acf601-07f8-4790-b498-0b2a6b36d89e'::uuid, 'Delaware',      38.7773::numeric, -75.3116::numeric, 'Milton, Pennsylvania',   'A')
) v(event_id, expect_state, true_lat, true_lon, wrong_city, grp);

-- ---------------------------------------------------------------------------
-- 1. GROUP A -- unlink the eight, flag them, and record WHY in a form a later pass
--    can read. `needs_attention` is set because a null city_id is a gap somebody
--    must eventually close, not a resolved state.
-- ---------------------------------------------------------------------------
update public.events e
   set city_id = null,
       needs_attention = true,
       enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('event_city_link', jsonb_build_object(
              'by', 'migration:99991789886174',
              'blocked', true,
              'reason', 'name_only_namesake_collision',
              'detail', format(
                'event is in %s, %s (corroborated by its own coordinates); it was linked to the %s row %s km away by name alone. That city cannot be created: public.cities is unique on (name, country) and trg_cities_aa_split_name strips a comma qualifier before the index sees it.',
                e.city, p.expect_state, p.wrong_city,
                round(haversine_m(e.latitude::numeric, e.longitude::numeric,
                                  c.latitude::numeric, c.longitude::numeric)::numeric / 1000, 0))))
  from _ns_plan p
  join public.events e2 on e2.id = p.event_id
  join public.cities c on c.id = e2.city_id
 where e.id = p.event_id
   and p.grp = 'A'
   and e.duplicate_of_id is null
   -- soft precondition: only act on the defect, so a concurrent repair no-ops
   and e.city_id is not null
   and lower(e.state) = lower(p.expect_state)
   -- signal 1: the event sits where its state text says it does
   and e.latitude is not null
   and haversine_m(e.latitude::numeric, e.longitude::numeric, p.true_lat, p.true_lon) < 25000
   -- signal 2: the city it is linked to is nowhere near that
   and c.latitude is not null
   and haversine_m(e.latitude::numeric, e.longitude::numeric,
                   c.latitude::numeric, c.longitude::numeric) > 250000;

-- ---------------------------------------------------------------------------
-- 2. GROUP B -- relink the two border-crossing collisions onto the rows that already
--    exist and that the events' own coordinates corroborate. Guarded on the WRONG
--    row so this cannot re-point an event a human has since placed correctly.
-- ---------------------------------------------------------------------------
update public.events e
   set city_id = tgt.id,
       needs_attention = false,
       enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('event_city_link', jsonb_build_object(
              'by', 'migration:99991789886174',
              'linked', true,
              'reason', 'namesake_collision_relinked_existing_row',
              'detail', format('moved from the %s row to %s (%s), %s km from the event''s own coordinates',
                wrong.region_name, tgt.slug, tgt.wikidata_qid,
                round(haversine_m(e.latitude::numeric, e.longitude::numeric,
                                  tgt.latitude::numeric, tgt.longitude::numeric)::numeric / 1000, 2))))
  from public.cities tgt, public.cities wrong
 where e.duplicate_of_id is null
   and e.latitude is not null
   and wrong.id = e.city_id
   and tgt.duplicate_of_id is null
   and (   (e.id = '40aefb71-e3b8-40d9-a206-4cbd33827e65' and tgt.slug = 'birmingham-us-78ymh'
            and tgt.wikidata_qid = 'Q79867' and wrong.slug = 'birmingham')
        or (e.id = 'aac86082-299f-4e2e-8944-5c4049581807' and tgt.slug = 'cambridge'
            and tgt.wikidata_qid = 'Q49111' and wrong.slug = 'cambridge-gb-2wpbj'))
   -- the target must be corroborated by the event, never merely named
   and haversine_m(e.latitude::numeric, e.longitude::numeric,
                   tgt.latitude::numeric, tgt.longitude::numeric) < 25000;

-- ---------------------------------------------------------------------------
-- 3. GROUP C -- the two rows whose LINK is right and whose DERIVED GEOGRAPHY is
--    wrong. Coordinates are removed rather than replaced: the correct value is the
--    city's, and the nightly fills derive it from the link that is already correct.
--    Each is guarded on the exact wrong value, so this is a no-op the moment either
--    is repaired by anything else.
-- ---------------------------------------------------------------------------

-- 3a. St. Petersburg: scraped lat/lng are Saint Petersburg, RUSSIA on a Florida event.
update public.events e
   set latitude = null,
       longitude = null,
       needs_attention = true,
       enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('event_geo_retract', jsonb_build_object(
              'by', 'migration:99991789886174',
              'retracted', jsonb_build_object('latitude', e.latitude, 'longitude', e.longitude),
              'reason', 'source_coordinates_name_collision',
              'detail', 'the scraped payload placed this event at 59.94/30.30 (Saint Petersburg, Russia). Its own description reads "in St. Pete Beach, Florida" and its source is stpetersburg.gaycities.com, so the St. Petersburg, Florida link is correct and the coordinates are not. Removed rather than guessed at a centroid.'))
 where e.id = '0aa93667-3d85-4714-8d2f-ec4adbc582c3'
   and e.duplicate_of_id is null
   and e.latitude is not null
   and haversine_m(e.latitude::numeric, e.longitude::numeric, 59.9406782::numeric, 30.2964999::numeric) < 25000;

-- 3b. Łódź: coordinates AND timezone are stale stamps from a merged-away Ukrainian row.
update public.events e
   set latitude = null,
       longitude = null,
       timezone = null,
       needs_attention = true,
       enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('event_geo_retract', jsonb_build_object(
              'by', 'migration:99991789886174',
              'retracted', jsonb_build_object('latitude', e.latitude, 'longitude', e.longitude, 'timezone', e.timezone),
              'reason', 'derived_from_a_city_row_since_merged_away',
              'detail', 'the source payload carries lat/lng null and city "Łódź"/PL, so these coordinates were derived, not scraped. They match the centroid of a second Łódź row (slug `od`, Volyn Oblast, Ukraine) that has since been merged away, and the timezone Europe/Kiev came from it too while the linked city is Europe/Warsaw. The link is correct; the derivation outlived the row it came from.'))
 where e.id = '03ec22b3-38cc-4bda-b20e-da1534e22898'
   and e.duplicate_of_id is null
   and e.latitude is not null
   and exists (select 1 from public.cities dead
                where dead.duplicate_of_id is not null
                  and dead.latitude = e.latitude and dead.longitude = e.longitude);

do $verify$
declare
  v_bad  int;
  v_moved int;
begin
  -- P1: all eight group-A events are unlinked and flagged.
  select count(*) into v_bad
    from _ns_plan p join public.events e on e.id = p.event_id
   where p.grp = 'A'
     and (e.city_id is not null or not e.needs_attention
          or e.enrichment_status->'event_city_link'->>'by' <> 'migration:99991789886174');
  if v_bad <> 0 then
    raise exception 'P1 failed: % group-A event(s) still linked, unflagged, or unstamped', v_bad;
  end if;

  -- P2: the two group-B events are on the corroborated row, un-flagged, and their
  --     country text was re-derived off the wrong country by trg_events_geo_derive.
  select count(*) into v_bad
    from public.events e join public.cities c on c.id = e.city_id
   where e.id in ('40aefb71-e3b8-40d9-a206-4cbd33827e65','aac86082-299f-4e2e-8944-5c4049581807')
     and (c.wikidata_qid not in ('Q79867','Q49111') or e.needs_attention or e.country = 'GB'
          or haversine_m(e.latitude::numeric, e.longitude::numeric,
                         c.latitude::numeric, c.longitude::numeric) > 25000);
  if v_bad <> 0 then
    raise exception 'P2 failed: % relinked event(s) are on the wrong row, still flagged, or still carry country GB', v_bad;
  end if;

  -- P3: the two group-C events KEPT their city and LOST the contradicted coordinates.
  select count(*) into v_bad from public.events e
   where e.id in ('0aa93667-3d85-4714-8d2f-ec4adbc582c3','03ec22b3-38cc-4bda-b20e-da1534e22898')
     and (e.city_id is null or e.latitude is not null or e.longitude is not null
          or e.enrichment_status->'event_geo_retract'->>'by' <> 'migration:99991789886174');
  if v_bad <> 0 then
    raise exception 'P3 failed: % group-C event(s) lost their city or kept their coordinates', v_bad;
  end if;

  -- P3b: the retracted values are recoverable from the row itself, not only from
  --      content_revisions. A retraction that records nothing is a deletion.
  select count(*) into v_bad from public.events e
   where e.id in ('0aa93667-3d85-4714-8d2f-ec4adbc582c3','03ec22b3-38cc-4bda-b20e-da1534e22898')
     and (e.enrichment_status->'event_geo_retract'->'retracted'->>'latitude') is null;
  if v_bad <> 0 then
    raise exception 'P3b failed: % group-C event(s) did not preserve the coordinates they retracted', v_bad;
  end if;

  -- P4: THE INVARIANT ITSELF. No live event is more than 250 km from the city it is
  --     presented on. This is the corpus-wide claim, so it also catches any row the
  --     hand-written plan above missed -- which is how the twelve were found.
  select count(*) into v_bad
    from public.events e join public.cities c on c.id = e.city_id
   where e.duplicate_of_id is null
     and e.latitude is not null and c.latitude is not null
     and haversine_m(e.latitude::numeric, e.longitude::numeric,
                     c.latitude::numeric, c.longitude::numeric) > 250000;
  if v_bad <> 0 then
    raise exception 'P4 failed: % event(s) are still hosted by a city over 250 km away', v_bad;
  end if;

  -- P5 MIRROR: EXACTLY the twelve moved. "The twelve are fixed" is equally satisfied
  --     by a sweep that unlinked the corpus, so the snapshot is what proves restraint.
  select count(*) into v_moved
    from _ns_before b join public.events e on e.id = b.id
   where e.city_id is distinct from b.city_id
      or e.latitude is distinct from b.latitude
      or e.timezone is distinct from b.timezone;
  if v_moved <> 12 then
    raise exception 'P5 failed: expected exactly 12 events to change, % changed', v_moved;
  end if;

  select count(*) into v_bad
    from _ns_before b join public.events e on e.id = b.id
   where (e.city_id is distinct from b.city_id or e.latitude is distinct from b.latitude)
     and e.id not in (select event_id from _ns_plan)
     and e.id not in ('40aefb71-e3b8-40d9-a206-4cbd33827e65','aac86082-299f-4e2e-8944-5c4049581807',
                      '0aa93667-3d85-4714-8d2f-ec4adbc582c3','03ec22b3-38cc-4bda-b20e-da1534e22898');
  if v_bad <> 0 then
    raise exception 'P5 failed: % event(s) outside the twelve were modified', v_bad;
  end if;

  -- P6 MIRROR: no personality lost its birth city. The Salisbury, North Carolina row
  --     is CORRECT for Wakefield Poole, who was born there -- the row is wrong for the
  --     event and right for the person, which is exactly why it must not be emptied.
  --     Compared against the snapshot rather than a remembered count of 1, so this
  --     keeps working when the corpus moves.
  select count(*) into v_bad
    from _ns_pers_before b
   where b.n is distinct from (select count(*) from public.personalities p where p.city_id = b.city_id);
  if v_bad <> 0 then
    raise exception 'P6 failed: % city row(s) changed their personality-birth count', v_bad;
  end if;

  -- P7 MIRROR: the cities this file unlinked FROM are all still live. Blocking an
  --     event must never be the thing that removes a city.
  select count(*) into v_bad
    from (values ('portland'),('lakewood'),('arlington-us-imfac'),
                 ('tmp-4f3d2206-b747-4617-9a0d-37be27aee945'),('sanford-us-5ibkl'),
                 ('milton'),('birmingham'),('cambridge-gb-2wpbj'),('st-petersburg'),('od-1')) s(slug)
   where not exists (select 1 from public.cities c
                      where c.slug = s.slug and c.duplicate_of_id is null);
  if v_bad <> 0 then
    raise exception 'P7 failed: % city row(s) this migration unlinked from are gone or merged', v_bad;
  end if;

  raise notice 'geo namesake: 8 blocked, 2 relinked, 2 geo-retracted; 0 events over 250 km from their city';
end
$verify$;

commit;
