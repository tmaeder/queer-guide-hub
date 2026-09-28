-- Two events are attached to a venue on the wrong continent, and the linker did not
-- do it. Nothing re-checks a link after the coordinates move.
--
-- 99991790379818 guarded the CONSEQUENCE: `tg_event_venue_geography` no longer
-- propagates a venue's city onto an event 250 km away. It named the remaining gap as
-- the event↔venue linker itself, citing 20260802100455's measured 23% error rate on
-- the name_exact branch. **THAT CITATION IS STALE AND THE LINKER IS EXONERATED.**
--
-- MEASURED, NOT ASSUMED. Across all 1,633 event↔venue links where both sides carry
-- coordinates: p50 3.0 km, p95 5.7, p99 10.2, and the third-worst is 14.0 km (a
-- legitimate Berlin case -- the event sits on the city centroid while its venue is out
-- at Marina Base). Then 2,397.8 km and 10,380.7 km, with nothing in between. So the
-- live error rate is **2 of 1,633, or 0.12%**, not 23%.
--
-- AND `link_event_venues` MADE NEITHER OF THEM:
--   * its auto branch is already `name_exact AND (distance_m IS NULL OR
--     distance_m < 500)` -- five hundred METRES, which both of these fail by four
--     orders of magnitude;
--   * across all 132 links it has ever recorded in `event_quality_signals`, the worst
--     distance is **430.0 m**, so that gate is holding;
--   * neither event carries `field_provenance.venue_id`, which the linker always
--     stamps, and neither has an `event_quality_signals` row from it;
--   * `content_revisions` records no `venue_id` change for either since the trail
--     began on 2026-09-14, and both rows were created in one bulk import on
--     2025-07-21, before the gate existed.
--   * the Sitges event has no `city_id` AT ALL, and the finder requires
--     `e.city_id IS NOT NULL`, so it could not even have been a candidate.
-- The links are historical. **Do not "harden" the linker on the strength of the old
-- 23% figure -- re-measure first; its gate is stricter than anything proposed here.**
--
-- SO THE REAL GAP IS THE ABSENCE OF A RE-CHECK, and that is what the sentinel below
-- is for: a link is validated once, at link time, and a venue or event that later
-- acquires or corrects its coordinates is never re-examined. These two were found by
-- hand, which is the failure mode this repo keeps recording.
--
-- THE TWO, and why the remedies differ:
--   Sitges Leder Gummi und Fetisch Treffen -> "Bears Bar", TAIPEI (country TW,
--     "No. 27 Lane 10, Chéngdu Road"), 10,380.7 km. There are three Bears Bars, and
--     one of them is IN SITGES (C. Bonaire 17) at **0.0 km** from the event's own
--     coordinates, so this is an unambiguous RELINK -- the Madrid one is 472 km away
--     and is not a candidate.
--   Megawoof Denver After Back Alley Party -> "Trade", 2,397.8 km. Both `Trade` rows
--     are Washington DC's; there is no Denver row to move it to, so the venue is
--     DETACHED rather than guessed, exactly as 99991790379818 did for Fort Lauderdale.
--
-- A THIRD DEFECT SITS UNDERNEATH THE DENVER ONE and is fixed here because it is a live
-- wrong claim in its own right: venue `0d350a5a` carries DC coordinates and the address
-- "1410 14th St NW" -- Washington DC's Trade -- while its `city_id` points at DENVER.
-- That is what made a Denver event able to find it by name+city in the first place. Its
-- coordinates sit **0.5 km** from the Washington, D.C. row, and the address agrees, so
-- two independent signals corroborate the repoint.
--
-- DELIBERATELY NOT DONE: the two `Trade` rows are both DC's, i.e. a venue DUPLICATE.
-- Repointing makes that visible to the dedup engine, which is where the decision
-- belongs; merging them here would be a second, unrelated claim.
--
-- Soft on preconditions, hard on postconditions: every write is guarded on the defect,
-- so a concurrent repair is skipped rather than aborting `db push` repo-wide.

begin;

create temporary table _evl_before on commit drop as
select id, venue_id, city_id from public.events where duplicate_of_id is null;

-- ---------------------------------------------------------------------------
-- 1. Sitges: relink onto the Bears Bar that is actually in Sitges.
--
--    The event's city_id is NULL and is deliberately NOT set here: attaching the
--    venue fires tg_event_venue_geography (BEFORE UPDATE OF venue_id), whose guard
--    passes at 0.0 km, so it derives the city from the venue itself. Writing it by
--    hand as well would be two writers for one fact. The postcondition asserts the
--    trigger did it, rather than trusting that it would.
-- ---------------------------------------------------------------------------
update public.events e
   set venue_id = tgt.id,
       needs_attention = false,
       enrichment_status = coalesce(e.enrichment_status,'{}'::jsonb)
         || jsonb_build_object('event_venue_link', jsonb_build_object(
              'by', 'migration:99991790537156',
              'relinked', true,
              'reason', 'venue_name_collision_across_countries',
              'detail', 'was attached to "Bears Bar" in Taipei (country TW), 10381 km away; moved to the Bears Bar in Sitges (C. Bonaire 17), 0.0 km from the event''s own coordinates. A third Bears Bar in Madrid is 472 km away and was not a candidate.'))
  from public.venues tgt
 where e.id = '82e80cfa-2256-4be1-9582-ed3b0af6e9e5'
   and tgt.id = 'fcba04b2-ab69-4e31-8ea8-a045c19b9123'
   and tgt.duplicate_of_id is null
   and e.duplicate_of_id is null
   -- soft precondition: only act on the defect
   and e.venue_id = '0731c6c6-a579-4de8-b6db-351620b91896'
   and e.latitude is not null
   -- the target must be corroborated by the event's own coordinates, never by name
   and haversine_m(e.latitude::numeric, e.longitude::numeric,
                   tgt.latitude::numeric, tgt.longitude::numeric) < 5000;

-- ---------------------------------------------------------------------------
-- 2. Denver: detach. Both `Trade` rows are DC's, so there is nothing to move it to.
--    `venue_name` text is kept as the only readable record of what to re-attach.
-- ---------------------------------------------------------------------------
update public.events e
   set venue_id = null,
       needs_attention = true,
       enrichment_status = coalesce(e.enrichment_status,'{}'::jsonb)
         || jsonb_build_object('event_venue_link', jsonb_build_object(
              'by', 'migration:99991790537156',
              'detached', true,
              'reason', 'venue_name_collision_no_correct_row_exists',
              'detail', 'was attached to "Trade" at 1410 14th St NW, Washington DC, 2398 km from this Denver event. Both Trade rows in the corpus are DC''s, so no Denver venue exists to move it to; detached rather than guessed.'))
 where e.id = 'd5c0c33f-4186-475d-a609-91ed1603aa96'
   and e.duplicate_of_id is null
   and e.venue_id = '0d350a5a-ae4d-407a-9912-cbb613a5fbc5';

-- ---------------------------------------------------------------------------
-- 3. The venue underneath it: DC's Trade is filed under Denver. Two independent
--    signals corroborate the repoint -- its coordinates are 0.5 km from the
--    Washington, D.C. row, and its address is "1410 14th St NW".
-- ---------------------------------------------------------------------------
update public.venues v
   set city_id = dc.id,
       needs_attention = true,
       enrichment_status = coalesce(v.enrichment_status,'{}'::jsonb)
         || jsonb_build_object('venue_city_link', jsonb_build_object(
              'by', 'migration:99991790537156',
              'repointed', true,
              'reason', 'city_contradicted_by_own_coordinates_and_address',
              'detail', 'filed under Denver while its coordinates sit 0.5 km from Washington, D.C. and its address reads "1410 14th St NW". Repointed to DC. NOTE: a second Trade row also sits in DC, so these two are a venue duplicate -- left for the dedup engine, deliberately not merged here.'))
  from public.cities dc
 where v.id = '0d350a5a-ae4d-407a-9912-cbb613a5fbc5'
   and dc.slug = 'washington-d-c'
   and dc.duplicate_of_id is null
   and v.duplicate_of_id is null
   and v.latitude is not null
   and haversine_m(v.latitude::numeric, v.longitude::numeric,
                   dc.latitude::numeric, dc.longitude::numeric) < 25000
   -- only act while it is still wrong
   and v.city_id is distinct from dc.id;

-- ---------------------------------------------------------------------------
-- 4. The sentinel. A link is validated once, at link time; nothing re-checks it when
--    either side's coordinates change. 100 km is measured, not chosen: p99 is 10.2 km
--    and the largest legitimate value is 14.0 km, so it carries ~7x headroom while
--    still catching both rows above by more than an order of magnitude.
--
--    `links_total` and `links_checkable` are reported FIRST and separately, because
--    "zero links over 100 km" is equally true of an empty corpus, a corpus with no
--    coordinates, and a clean one.
-- ---------------------------------------------------------------------------
create or replace function public.event_venue_link_signals()
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v jsonb;
begin
  perform public.assert_admin_or_internal();
  with d as (
    select e.id, e.title, v.name vname,
      public.haversine_m(e.latitude::numeric, e.longitude::numeric,
                         v.latitude::numeric, v.longitude::numeric) / 1000 as km
    from public.events e
    join public.venues v on v.id = e.venue_id
    where e.duplicate_of_id is null and v.duplicate_of_id is null
      and e.latitude is not null and v.latitude is not null
  )
  select jsonb_build_object(
    'probe_ok', true,
    'links_total', (select count(*) from public.events
                     where venue_id is not null and duplicate_of_id is null),
    'links_checkable', (select count(*) from d),
    'p99_km', (select round(percentile_disc(0.99) within group (order by km)::numeric, 1) from d),
    'over_100km', (select count(*) from d where km > 100),
    'offenders', coalesce((select jsonb_agg(jsonb_build_object(
        'event_id', id, 'title', left(title, 60), 'venue', vname, 'km', round(km::numeric, 0)))
      from (select * from d where km > 100 order by km desc limit 20) z), '[]'::jsonb)
  ) into v;
  return v;
end
$function$;

revoke all on function public.event_venue_link_signals() from public;
grant execute on function public.event_venue_link_signals() to service_role;

do $verify$
declare
  v_bad int;
  v_moved int;
  v_sig jsonb;
begin
  -- P1: the Sitges event is on the Sitges Bears Bar and its own coordinates agree.
  select count(*) into v_bad
    from public.events e join public.venues v on v.id = e.venue_id
   where e.id = '82e80cfa-2256-4be1-9582-ed3b0af6e9e5'
     and (v.id <> 'fcba04b2-ab69-4e31-8ea8-a045c19b9123'
          or haversine_m(e.latitude::numeric, e.longitude::numeric,
                         v.latitude::numeric, v.longitude::numeric) > 5000);
  if v_bad <> 0 then
    raise exception 'P1 failed: the Sitges event is not on the Sitges Bears Bar';
  end if;

  -- P1b: and the trigger derived its city from that venue rather than leaving it null.
  --      Asserted rather than assumed -- this is the guard 99991790379818 shipped,
  --      doing the positive half of its job.
  select count(*) into v_bad
    from public.events e join public.cities c on c.id = e.city_id
   where e.id = '82e80cfa-2256-4be1-9582-ed3b0af6e9e5'
     and haversine_m(e.latitude::numeric, e.longitude::numeric,
                     c.latitude::numeric, c.longitude::numeric) < 25000;
  if v_bad <> 1 then
    raise exception 'P1b failed: tg_event_venue_geography did not derive a corroborated city for the Sitges event';
  end if;

  -- P2: the Denver event is detached, flagged, and kept its venue text.
  select count(*) into v_bad from public.events
   where id = 'd5c0c33f-4186-475d-a609-91ed1603aa96'
     and (venue_id is not null or not needs_attention
          or nullif(btrim(coalesce(venue_name,'')),'') is null);
  if v_bad <> 0 then
    raise exception 'P2 failed: the Denver event is still attached, unflagged, or lost its venue text';
  end if;

  -- P3: DC's Trade is filed in DC.
  select count(*) into v_bad
    from public.venues v join public.cities c on c.id = v.city_id
   where v.id = '0d350a5a-ae4d-407a-9912-cbb613a5fbc5'
     and (c.slug <> 'washington-d-c'
          or haversine_m(v.latitude::numeric, v.longitude::numeric,
                         c.latitude::numeric, c.longitude::numeric) > 25000);
  if v_bad <> 0 then
    raise exception 'P3 failed: the Trade venue is not filed in Washington, D.C.';
  end if;

  -- P4: THE INVARIANT, corpus-wide. Scoped to these rows it would pass while a third
  --     sat live, which is how both of these survived a year.
  select count(*) into v_bad
    from public.events e join public.venues v on v.id = e.venue_id
   where e.duplicate_of_id is null and v.duplicate_of_id is null
     and e.latitude is not null and v.latitude is not null
     and haversine_m(e.latitude::numeric, e.longitude::numeric,
                     v.latitude::numeric, v.longitude::numeric) > 100000;
  if v_bad <> 0 then
    raise exception 'P4 failed: % event(s) are still attached to a venue over 100 km away', v_bad;
  end if;

  -- P5: the sentinel actually runs and agrees with P4. A function that errors is
  --     indistinguishable from a clean corpus once it is behind a health script.
  v_sig := public.event_venue_link_signals();
  if (v_sig->>'probe_ok') is distinct from 'true'
     or (v_sig->>'over_100km')::int <> 0
     or (v_sig->>'links_checkable')::int < 1000 then
    raise exception 'P5 failed: event_venue_link_signals() disagrees with P4 or sees too few links: %', v_sig;
  end if;

  -- P6 MIRROR: exactly the rows this file undertook to move, and no others. "Zero
  --     links over 100 km" is equally satisfied by detaching every venue in the corpus.
  select count(*) into v_moved
    from _evl_before b join public.events e on e.id = b.id
   where e.venue_id is distinct from b.venue_id or e.city_id is distinct from b.city_id;
  if v_moved <> 2 then
    raise exception 'P6 failed: expected exactly 2 events to change, % changed', v_moved;
  end if;

  -- P7 MIRROR: the 1,631 links that were already correct are untouched, and the
  --     99991790379818 repair is still in place.
  select count(*) into v_bad
    from public.events e join public.venues v on v.id = e.venue_id
   where e.duplicate_of_id is null and e.latitude is not null and v.latitude is not null
     and haversine_m(e.latitude::numeric, e.longitude::numeric,
                     v.latitude::numeric, v.longitude::numeric) <= 100000;
  if v_bad < 1600 then
    raise exception 'P7 failed: only % correct venue link(s) survive — this pass detached far more than its two', v_bad;
  end if;

  select count(*) into v_bad from public.events
   where id = 'e277dc22-1de3-4d55-9842-f2d49d53d459' and venue_id is not null;
  if v_bad <> 0 then
    raise exception 'P7 failed: the Fort Lauderdale event 99991790379818 detached has been re-attached';
  end if;

  raise notice 'event venue links: 1 relinked, 1 detached, 1 venue refiled, 0 links over 100 km';
end
$verify$;

commit;
