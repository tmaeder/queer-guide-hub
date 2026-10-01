-- I detached an event from a wrong venue while the CORRECT venue was in the corpus,
-- and wrote the reason why not into production data as a fact. The reason was false.
--
-- 99991790537156 (#3984) detached `Megawoof Denver After Back Alley Party` from
-- "Trade" at 1410 14th St NW, Washington DC -- 2,398 km away -- which was right. What
-- it stamped on the row is not:
--
--   "Both Trade rows in the corpus are DC's, so no Denver venue exists to move it to;
--    detached rather than guessed."
--
-- There are THREE venues named Trade, not two, and only one of them is DC's:
--
--   0d350a5a  1410 14th St NW           38.9093 / -77.0328   Washington DC
--   7146a3a9  475 Santa Fe Drive, Denver 39.7239 / -104.9988  DENVER, category bar
--   086a792a  1408-1412 NW 14th Street  45.7911 / -122.5526   no city (Portland area)
--
-- Denver's Trade is a real, open bar, and the event sits **0.01 km** from it. So the
-- claim was refutable by one query against the same table the detach had just read,
-- and the detach left an event permanently unlinked from a venue that was there all
-- along. It also would have been WRONG to merge the three, which is what the earlier
-- entry implied by calling them "a duplicate for the dedup engine": merging 7146a3a9
-- away would have destroyed Denver's own venue.
--
-- WHY THE FIRST PASS GOT IT WRONG, recorded so the shape is recognisable: at that
-- moment 0d350a5a was still MISFILED under Denver, so a query for Trade rows returned
-- two Denver-filed rows, and reading their addresses -- one plainly DC -- collapsed
-- into "both are DC's". The refile that pass performed is exactly what made the
-- remaining Denver row easy to see afterwards. A claim of the form "no correct row
-- exists" is a claim about the whole table and must be re-queried after any write that
-- changes what the table says, not carried over from the reading that motivated it.
--
-- THE RELINK RESTS ON THREE INDEPENDENT SIGNALS, not proximity alone -- the rule this
-- repo applies to `venue-accessibility-osm` and `link_event_venues`:
--   * coordinates agree to 0.01 km
--   * the event's own `city` text is "Denver" and `state` is "Colorado", and the venue's
--     city_id IS the `denver` row
--   * the names match exactly, and the venue is a bar that is not closed
-- Measured: event.city_id, venue.city_id and cities.slug='denver' are all
-- a11395e4-ee56-4141-bbae-8f62eecb7ed8, so this relink moves no city. It is asserted
-- rather than assumed, because attaching a venue fires tg_event_venue_geography
-- (99991790379818), whose corroboration guard passes at 0.01 km and then derives the
-- city itself.
--
-- The DC row and the Portland-coordinate row are NOT touched. 086a792a has no city,
-- no events and coordinates near Portland with an address that does not obviously
-- belong to any of the three; establishing what it is needs evidence this file does
-- not have, so it is reported and left alone rather than guessed at.
--
-- Soft on preconditions, hard on postconditions: guarded on the defect, so a
-- concurrent repair is skipped rather than aborting `db push` repo-wide.

begin;

create temporary table _tr_before on commit drop as
select id, venue_id, city_id from public.events where duplicate_of_id is null;

-- ---------------------------------------------------------------------------
-- Relink, and replace the false claim with what is actually true. The stamp keeps
-- the original detach on record under `corrected_from` rather than erasing it: the
-- detach was right, only its stated reason was wrong.
-- ---------------------------------------------------------------------------
update public.events e
   set venue_id = v.id,
       needs_attention = false,
       enrichment_status = coalesce(e.enrichment_status, '{}'::jsonb)
         || jsonb_build_object('event_venue_link', jsonb_build_object(
              'by', 'migration:99991790796466',
              'linked', true,
              'reason', 'relinked_to_the_row_the_previous_pass_wrongly_said_did_not_exist',
              'detail', 'attached to Trade, 475 Santa Fe Drive, Denver (39.7239/-104.9988), 0.01 km from the event''s own coordinates, name-exact, and the venue''s city IS the denver row. 99991790537156 detached this event from the Washington DC Trade -- correctly -- but stamped "no Denver venue exists to move it to", which was false: there are three Trade rows and only one is DC''s.',
              'corrected_from', e.enrichment_status->'event_venue_link'))
  from public.venues v
  join public.cities c on c.id = v.city_id
 where e.id = 'd5c0c33f-4186-475d-a609-91ed1603aa96'
   and v.id = '7146a3a9-bcc8-4ae5-bb2c-29348b7c91f2'
   and c.slug = 'denver'
   and v.duplicate_of_id is null
   and v.closed_at is null
   and e.duplicate_of_id is null
   -- only act on the defect: still detached, and still carrying the false claim
   and e.venue_id is null
   and e.enrichment_status->'event_venue_link'->>'reason'
       = 'venue_name_collision_no_correct_row_exists'
   -- and only when the coordinates really do agree
   and e.latitude is not null
   and haversine_m(e.latitude::numeric, e.longitude::numeric,
                   v.latitude::numeric, v.longitude::numeric) < 1000;

do $verify$
declare
  v_bad int;
  v_moved int;
begin
  -- P1: the event is on Denver's Trade, un-flagged, and its coordinates agree.
  select count(*) into v_bad
    from public.events e
    join public.venues v on v.id = e.venue_id
    join public.cities c on c.id = v.city_id
   where e.id = 'd5c0c33f-4186-475d-a609-91ed1603aa96'
     and (v.id <> '7146a3a9-bcc8-4ae5-bb2c-29348b7c91f2' or c.slug <> 'denver'
          or e.needs_attention
          or haversine_m(e.latitude::numeric, e.longitude::numeric,
                         v.latitude::numeric, v.longitude::numeric) > 1000);
  if v_bad <> 0 then
    raise exception 'P1 failed: the Denver event is not on Denver''s Trade';
  end if;
  -- and it IS linked at all (the join above is vacuously satisfied by venue_id null)
  select count(*) into v_bad from public.events
   where id = 'd5c0c33f-4186-475d-a609-91ed1603aa96' and venue_id is null;
  if v_bad <> 0 then
    raise exception 'P1 failed: the Denver event is still detached';
  end if;

  -- P2: the false claim no longer STATES the row's reason, and the original is kept.
  --
  -- Deliberately NOT an `ilike '%no Denver venue exists%'` over the new detail. The
  -- first draft was exactly that and it FAILED on correct code, because the corrected
  -- detail quotes the false claim in order to explain it -- the same
  -- statement-quotes-its-own-defect trap that makes a bare `toContain` vacuous, here
  -- inverted into a false positive. Caught by the dry run, not by reading.
  --
  -- So the assertion is positional instead: the phrase must appear ONLY under
  -- `corrected_from`, which simultaneously proves the original was preserved and that
  -- it is no longer what the row asserts.
  select count(*) into v_bad from public.events
   where id = 'd5c0c33f-4186-475d-a609-91ed1603aa96'
     and (enrichment_status->'event_venue_link'->>'reason'
            = 'venue_name_collision_no_correct_row_exists'
          or coalesce((enrichment_status->'event_venue_link'->>'linked')::boolean, false) is false
          or enrichment_status->'event_venue_link'->'corrected_from'->>'reason'
             <> 'venue_name_collision_no_correct_row_exists'
          or enrichment_status->'event_venue_link'->'corrected_from'->>'detail'
             not ilike '%no Denver venue exists%');
  if v_bad <> 0 then
    raise exception 'P2 failed: the false claim still states the reason, or the original was erased';
  end if;

  -- P3: the city did not move. All three ids were measured equal beforehand, so a
  --     change here means tg_event_venue_geography did something unexpected.
  select count(*) into v_bad
    from public.events e join public.cities c on c.id = e.city_id
   where e.id = 'd5c0c33f-4186-475d-a609-91ed1603aa96' and c.slug <> 'denver';
  if v_bad <> 0 then
    raise exception 'P3 failed: the event left the denver city row';
  end if;

  -- P4 MIRROR: the other two Trade rows are untouched and still live. Merging them is
  --     what the earlier entry wrongly implied; destroying Denver's own venue -- or
  --     DC's -- is the failure this file exists to not repeat.
  select count(*) into v_bad from public.venues
   where id in ('0d350a5a-ae4d-407a-9912-cbb613a5fbc5','086a792a-7246-4699-b4a8-d9e0ebd85aab')
     and duplicate_of_id is null;
  if v_bad <> 2 then
    raise exception 'P4 failed: expected both other Trade rows to remain live, found %', v_bad;
  end if;
  select count(*) into v_bad from public.venues v join public.cities c on c.id = v.city_id
   where v.id = '0d350a5a-ae4d-407a-9912-cbb613a5fbc5' and c.slug <> 'washington-d-c';
  if v_bad <> 0 then
    raise exception 'P4 failed: the DC Trade row left washington-d-c';
  end if;

  -- P5 MIRROR: exactly ONE event changed. "The event is linked" is equally satisfied
  --     by a pass that attached venues across the corpus.
  select count(*) into v_moved
    from _tr_before b join public.events e on e.id = b.id
   where e.venue_id is distinct from b.venue_id or e.city_id is distinct from b.city_id;
  if v_moved <> 1 then
    raise exception 'P5 failed: expected exactly 1 event to change, % changed', v_moved;
  end if;

  -- P6: the invariants the previous two passes established still hold, corpus-wide.
  select count(*) into v_bad
    from public.events e join public.venues v on v.id = e.venue_id
    join public.cities c on c.id = v.city_id
   where e.duplicate_of_id is null and e.latitude is not null and c.latitude is not null
     and haversine_m(e.latitude::numeric, e.longitude::numeric,
                     c.latitude::numeric, c.longitude::numeric) > 250000;
  if v_bad <> 0 then
    raise exception 'P6 failed: % venue-backed event(s) over 250 km from their city', v_bad;
  end if;

  raise notice 'denver trade: event relinked at 0.01 km, false claim corrected, other two Trade rows intact';
end
$verify$;

commit;
