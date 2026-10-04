import { describe, expect, it } from 'vitest';
import { tripRoute } from '../tripRouteSource';
import type { TripPlace } from '@/hooks/useTrips';

const place = (over: Partial<TripPlace> & { id: string }): TripPlace =>
  ({
    trip_id: 't1',
    day_id: null,
    venue_id: null,
    event_id: null,
    hotel_id: null,
    custom_name: null,
    custom_address: null,
    latitude: 0,
    longitude: 0,
    city_id: null,
    country_id: null,
    start_time: null,
    end_time: null,
    duration_minutes: null,
    notes: null,
    category: null,
    sort_order: 0,
    created_by: null,
    created_at: '2026-01-01',
    booking_status: 'intent',
    reservation_id: null,
    ...over,
  }) as TripPlace;

const base = { tripId: 't1', title: 'Berlin weekend' };

describe('tripRoute ordering', () => {
  it('orders by day, then by sort_order within the day', () => {
    const { route } = tripRoute({
      ...base,
      days: [
        { id: 'd2', day_number: 2 },
        { id: 'd1', day_number: 1 },
      ],
      places: [
        place({ id: 'b', day_id: 'd2', sort_order: 0, custom_name: 'day2-first' }),
        place({ id: 'a', day_id: 'd1', sort_order: 1, custom_name: 'day1-second' }),
        place({ id: 'c', day_id: 'd1', sort_order: 0, custom_name: 'day1-first' }),
      ],
    });
    expect(route.stops.map((s) => s.station.name)).toEqual([
      'day1-first',
      'day1-second',
      'day2-first',
    ]);
    expect(route.stops.map((s) => s.position)).toEqual([1, 2, 3]);
  });

  it('keeps the UNASSIGNED bucket rather than dropping it', () => {
    // `TripMap` filtered these out. A place with no day is still a stop, and
    // dropping it silently shortens the route.
    const { route, unmapped } = tripRoute({
      ...base,
      days: [{ id: 'd1', day_number: 1 }],
      places: [
        place({ id: 'x', day_id: null, sort_order: 0, custom_name: 'floating' }),
        place({ id: 'y', day_id: 'd1', sort_order: 0, custom_name: 'scheduled' }),
      ],
    });
    expect(route.stops).toHaveLength(2);
    expect(unmapped).toHaveLength(0);
    // and it sorts LAST, not first — an undated day is not day zero
    expect(route.stops.map((s) => s.station.name)).toEqual(['scheduled', 'floating']);
  });

  it('sorts an unnumbered day last rather than first', () => {
    // `null - 1` is NaN under a naive compare, and `?? 0` would put it ahead
    // of day 1.
    const { route } = tripRoute({
      ...base,
      days: [
        { id: 'dn', day_number: null },
        { id: 'd1', day_number: 1 },
      ],
      places: [
        place({ id: 'n', day_id: 'dn', custom_name: 'undated' }),
        place({ id: 'o', day_id: 'd1', custom_name: 'day-one' }),
      ],
    });
    expect(route.stops.map((s) => s.station.name)).toEqual(['day-one', 'undated']);
  });
});

describe('tripRoute gaps', () => {
  it('a place with no coordinates CONSUMES its position', () => {
    // The gap is the point. Renumbering the survivors 1,2,3 would present a
    // three-stop route when the trip has four places.
    const { route, unmapped } = tripRoute({
      ...base,
      places: [
        place({ id: '1', sort_order: 0, latitude: 52.5, longitude: 13.4, custom_name: 'one' }),
        place({ id: '2', sort_order: 1, latitude: null, longitude: null, custom_name: 'nowhere' }),
        place({ id: '3', sort_order: 2, latitude: 48.8, longitude: 2.35, custom_name: 'three' }),
      ],
    });
    expect(route.stops.map((s) => s.position)).toEqual([1, 3]);
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0].reason).toBe('no_coordinates');
    expect(unmapped[0].place.id).toBe('2');
  });

  it('reports the unmapped count rather than swallowing it', () => {
    const { unmapped } = tripRoute({
      ...base,
      places: [
        place({ id: 'a', latitude: null, longitude: null }),
        place({ id: 'b', latitude: null, longitude: null }),
      ],
    });
    expect(unmapped).toHaveLength(2);
  });
});

describe('tripRoute stations', () => {
  it('puts each entity on its own line', () => {
    const { route } = tripRoute({
      ...base,
      places: [
        place({ id: 'v', sort_order: 0, venue_id: 'v1', latitude: 1, longitude: 1 }),
        place({ id: 'e', sort_order: 1, event_id: 'e1', latitude: 2, longitude: 2 }),
        place({ id: 'h', sort_order: 2, hotel_id: 'h1', latitude: 3, longitude: 3 }),
      ],
    });
    expect(route.stops.map((s) => s.station.line)).toEqual(['M', 'E', 'T']);
    expect(route.stops.map((s) => s.station.entity)).toEqual(['venue', 'event', 'hotel']);
  });

  it('routes a community venue onto C, not M', () => {
    // The whole reason the line is category-driven: a community centre in a
    // trip is on the care line, same as everywhere else.
    const { route } = tripRoute({
      ...base,
      places: [
        place({
          id: 'c',
          venue_id: 'v9',
          latitude: 1,
          longitude: 1,
          venues: { id: 'v9', name: 'Centre', category: 'community_center', images: null, address: null },
        }),
      ],
    });
    expect(route.stops[0].station.line).toBe('C');
  });

  it('keys an entity stop on the ENTITY, so saved/visited lookups match', () => {
    const { route } = tripRoute({
      ...base,
      places: [place({ id: 'row-1', venue_id: 'abc', latitude: 1, longitude: 1 })],
    });
    // Not `trip-place-row-1` — that id matches nothing the rest of the map
    // knows, so a saved venue in a trip would not read as saved.
    expect(route.stops[0].station.id).toBe('venue-abc');
  });

  it('keys a CUSTOM stop on the trip-place row, which is still unique', () => {
    const { route } = tripRoute({
      ...base,
      places: [place({ id: 'row-2', custom_name: 'Picnic spot', latitude: 1, longitude: 1 })],
    });
    expect(route.stops[0].station.id).toBe('trip-place-row-2');
    expect(route.stops[0].station.name).toBe('Picnic spot');
  });

  it('carries canEdit onto every station — and withholds it from a viewer', () => {
    // `TripPlannerPage` computed `canEdit`, gated the generator and `readOnly`
    // with it, and never passed it to the map: viewers and editors saw an
    // identical map. RLS is still the source of truth.
    const places = [place({ id: 'v', venue_id: 'v1', latitude: 1, longitude: 1 })];
    expect(tripRoute({ ...base, places, canEdit: true }).route.stops[0].station.editable).toBe(true);
    expect(tripRoute({ ...base, places, canEdit: false }).route.stops[0].station.editable).toBe(
      false,
    );
    // omitted is NOT editable — a missing prop must not grant the affordance
    expect(tripRoute({ ...base, places }).route.stops[0].station.editable).toBe(false);
  });

  it('carries arrive_mode without inventing one', () => {
    const { route } = tripRoute({
      ...base,
      places: [
        place({ id: 'a', sort_order: 0, latitude: 1, longitude: 1, arrive_mode: 'walk' }),
        place({ id: 'b', sort_order: 1, latitude: 2, longitude: 2 }),
      ],
    });
    expect(route.stops[0].arriveMode).toBe('walk');
    // No routing, no estimates. Absent means absent.
    expect(route.stops[1].arriveMode).toBeUndefined();
  });

  it('never marks a trip stop featured or live', () => {
    // A default of `true` would ring every stop as an interchange or pulse it
    // as happening now.
    const { route } = tripRoute({
      ...base,
      places: [place({ id: 'a', latitude: 1, longitude: 1 })],
    });
    expect(route.stops[0].station.featured).toBe(false);
    expect(route.stops[0].station.live).toBe(false);
  });
});
