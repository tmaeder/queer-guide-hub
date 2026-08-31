-- Widen `trip_places.arrive_mode` from the three urban modes to the eight a
-- real trip uses.
--
-- The original vocabulary — walk / transit / drive — was written for hops
-- inside one city. It is `/trips/discover` that made it wrong: that surface
-- builds routes of 3-5 cities across borders and writes them as consecutive
-- `trip_places`, so the leg between two stops is routinely several hundred
-- kilometres and the planner was labelling a 900 km hop "drive, ~13 h".
--
-- WHAT THIS IS NOT. A mode is a LABEL and an estimate, nothing more. Journey
-- planning stays permanently out of scope per
-- `docs/plans/2026-08-30-transit-mobility-phase-4-design.md`: it needs an
-- origin, a destination and a time of request, and that triple IS the sensitive
-- query. No column here is populated from a routing API and none should be.
--
-- Safe to apply in either order with the client: the column is nullable, every
-- existing value stays legal, and the constraint only widens. Measured before
-- writing this: `arrive_mode` is NULL on all 6 live rows, so nothing is being
-- migrated — only the ceiling is being raised.

alter table public.trip_places
  drop constraint if exists trip_places_arrive_mode_check;

alter table public.trip_places
  add constraint trip_places_arrive_mode_check
  check (
    arrive_mode is null
    or arrive_mode = any (array[
      'walk', 'cycle', 'transit', 'drive', 'rideshare', 'rail', 'ferry', 'flight'
    ]::text[])
  );

comment on column public.trip_places.arrive_mode is
  'User override for the heuristic route-leg transport mode (src/components/trips/tripLegs.ts). A label and a speed assumption, never a routed itinerary — nothing writes this from an external routing API.';
