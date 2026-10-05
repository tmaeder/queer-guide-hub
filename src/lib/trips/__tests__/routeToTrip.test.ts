import { describe, expect, it } from 'vitest';
import {
  isCopyableStop,
  routeCopySummary,
  routeToTripPlaces,
  type RouteToTripResult,
} from '@/lib/trips/routeToTrip';
import type { ClassifiedStop } from '@/lib/guideRouteChecks';
import type { EntityGeo } from '@/lib/trips/resolveEntityGeo';
import type { GuideEntityType } from '@/lib/guidePickAdapters';

function stop(
  over: Partial<{
    id: string;
    entity_type: GuideEntityType;
    entity_id: string;
    position: number;
    note: string | null;
    state: ClassifiedStop['state'];
    name: string;
    reason: string | null;
  }> = {},
): ClassifiedStop {
  const entity_type = over.entity_type ?? 'venue';
  const entity_id = over.entity_id ?? 'v1';
  const state = over.state ?? 'resolved';
  return {
    pick: {
      id: over.id ?? 'p1',
      entity_type,
      entity_id,
      position: over.position ?? 1,
      note: over.note ?? null,
    },
    state,
    display:
      state === 'missing'
        ? null
        : {
            name: over.name ?? 'Somewhere',
            href: '/venues/somewhere',
            imagePath: null,
            metaLine: null,
            categoryLabel: 'bar',
            lat: 52.52,
            lng: 13.4,
            geo: 'own',
          },
    reason: over.reason ?? null,
  };
}

const geoFor = (id: string, type: 'venue' | 'event' = 'venue'): EntityGeo => ({
  id,
  type,
  name: `Place ${id}`,
  city_id: 'city-1',
  country_id: 'country-1',
  latitude: 52.52,
  longitude: 13.4,
  address: '1 Example St',
  category: 'bar',
});

describe('what can be copied at all', () => {
  it('venue and event can; the geographic types cannot', () => {
    /**
     * `trip_places` has venue_id / event_id / hotel_id columns, and
     * `resolveEntityGeo` only handles venue and event — so a city stop has no
     * column to land in. Coercing it into a custom place would put a trip stop
     * called "Berlin" in someone's itinerary.
     */
    expect(isCopyableStop('venue')).toBe(true);
    expect(isCopyableStop('event')).toBe(true);
    for (const t of ['city', 'country', 'queer_village', 'marketplace'] as GuideEntityType[]) {
      expect(isCopyableStop(t)).toBe(false);
    }
  });

  it('an uncopyable stop is SKIPPED WITH A REASON, not dropped', () => {
    const r = routeToTripPlaces([stop({ entity_type: 'city', entity_id: 'c1' })], new Map());
    expect(r.rows).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/no place to land/i);
    // The position is carried so the reader can find which stop it was.
    expect(r.skipped[0].position).toBe(1);
  });
});

describe('all stops land on ONE day, unscheduled', () => {
  const three = [
    stop({ id: 'a', entity_id: 'v1', position: 1 }),
    stop({ id: 'b', entity_id: 'v2', position: 2 }),
    stop({ id: 'c', entity_id: 'v3', position: 3 }),
  ];
  const geo = new Map([
    ['v1', geoFor('v1')],
    ['v2', geoFor('v2')],
    ['v3', geoFor('v3')],
  ]);

  it('writes no times at all — no auto-scheduling', () => {
    const r = routeToTripPlaces(three, geo);
    expect(r.rows).toHaveLength(3);
    for (const row of r.rows) {
      expect(row.start_time).toBeNull();
      expect(row.end_time).toBeNull();
      expect(row.duration_minutes).toBeNull();
    }
  });

  it('puts every row on the SAME day', () => {
    const r = routeToTripPlaces(three, geo, { dayId: 'day-1' });
    expect(new Set(r.rows.map((x) => x.day_id))).toEqual(new Set(['day-1']));
  });

  it('defaults to no day rather than inventing one', () => {
    expect(routeToTripPlaces(three, geo).rows.every((x) => x.day_id === null)).toBe(true);
  });

  it('carries the route order into sort_order, densely', () => {
    const r = routeToTripPlaces(three, geo);
    expect(r.rows.map((x) => x.sort_order)).toEqual([0, 1, 2]);
  });

  it('sort_order stays dense when a stop in the MIDDLE is skipped', () => {
    // The map keeps a gap (the stop number is the pick position); a trip is a
    // list the reader will reorder, so it must not carry a hole.
    const withGap = [
      stop({ id: 'a', entity_id: 'v1', position: 1 }),
      stop({
        id: 'b',
        entity_id: 'v2',
        position: 2,
        state: 'unresolved',
        reason: 'No coordinates.',
      }),
      stop({ id: 'c', entity_id: 'v3', position: 3 }),
    ];
    const r = routeToTripPlaces(withGap, geo);
    expect(r.rows.map((x) => x.sort_order)).toEqual([0, 1]);
    expect(r.skipped).toHaveLength(1);
  });
});

describe('nothing is dropped silently', () => {
  it('an unresolved stop keeps its own reason', () => {
    const r = routeToTripPlaces(
      [stop({ state: 'unresolved', reason: 'Target has no coordinates yet.' })],
      new Map(),
    );
    expect(r.rows).toHaveLength(0);
    expect(r.skipped[0].reason).toBe('Target has no coordinates yet.');
  });

  it('a missing stop keeps its own reason and still names a stop', () => {
    const r = routeToTripPlaces(
      [stop({ state: 'missing', position: 4, reason: 'Target not visible.' })],
      new Map(),
    );
    expect(r.skipped[0].reason).toBe('Target not visible.');
    // `display` is null for a missing stop, so the name falls back rather than
    // rendering "undefined" in a toast.
    expect(r.skipped[0].name).toBe('Stop 4');
  });

  it('MAP-resolved but TRIP-unreadable is its own reason, not "unmapped"', () => {
    /**
     * The decisive case. The pick adapter and `resolveEntityGeo` are two reads
     * under two different RLS paths, so they can genuinely disagree — and
     * telling the reader "could not be mapped" when the map drew it fine would
     * be a wrong diagnosis.
     */
    const r = routeToTripPlaces([stop({ entity_id: 'v9' })], new Map());
    expect(r.rows).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/restricted/i);
    expect(r.skipped[0].reason).not.toMatch(/could not be mapped/i);
  });

  it('every input stop appears in exactly one of rows or skipped', () => {
    // The positive control for "nothing is dropped": the two output lists have
    // to account for the whole input.
    const input = [
      stop({ id: 'a', entity_id: 'v1', position: 1 }),
      stop({ id: 'b', entity_id: 'c1', entity_type: 'city', position: 2 }),
      stop({ id: 'c', entity_id: 'v3', position: 3, state: 'unresolved', reason: 'x' }),
      stop({ id: 'd', entity_id: 'v4', position: 4, state: 'missing', reason: 'y' }),
    ];
    const r = routeToTripPlaces(input, new Map([['v1', geoFor('v1')]]));
    expect(r.rows.length + r.skipped.length).toBe(input.length);
  });
});

describe('idempotence', () => {
  const two = [
    stop({ id: 'a', entity_id: 'v1', position: 1 }),
    stop({ id: 'b', entity_id: 'v2', position: 2 }),
  ];
  const geo = new Map([
    ['v1', geoFor('v1')],
    ['v2', geoFor('v2')],
  ]);

  it('copying twice yields the same set', () => {
    const first = routeToTripPlaces(two, geo);
    const keys = new Set(
      first.rows.map((r) => `${r.venue_id ? 'venue' : 'event'}:${r.venue_id ?? r.event_id}`),
    );
    const second = routeToTripPlaces(two, geo, { existingKeys: keys });
    expect(first.rows).toHaveLength(2);
    expect(second.rows).toHaveLength(0);
  });

  it('a loop that returns to its start inserts that stop ONCE', () => {
    const loop = [
      stop({ id: 'a', entity_id: 'v1', position: 1 }),
      stop({ id: 'b', entity_id: 'v2', position: 2 }),
      stop({ id: 'c', entity_id: 'v1', position: 3 }),
    ];
    expect(routeToTripPlaces(loop, geo).rows).toHaveLength(2);
  });

  it('a repeat is NOT reported as a skip — it is not a failure', () => {
    const loop = [
      stop({ id: 'a', entity_id: 'v1', position: 1 }),
      stop({ id: 'c', entity_id: 'v1', position: 2 }),
    ];
    const r = routeToTripPlaces(loop, geo);
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toHaveLength(0);
  });
});

describe('the stop note travels with the stop', () => {
  it('carries the pick note onto the trip place', () => {
    const r = routeToTripPlaces(
      [stop({ note: 'Ask for the back room.' })],
      new Map([['v1', geoFor('v1')]]),
    );
    expect(r.rows[0].notes).toBe('Ask for the back room.');
  });

  it('a stop with no note writes null, not the string "null"', () => {
    const r = routeToTripPlaces([stop({ note: null })], new Map([['v1', geoFor('v1')]]));
    expect(r.rows[0].notes).toBeNull();
  });
});

describe('routeCopySummary', () => {
  const mk = (added: number, skipped: number): RouteToTripResult => ({
    rows: Array.from({ length: added }, () => ({}) as never),
    skipped: Array.from({ length: skipped }, (_, i) => ({
      name: `s${i}`,
      position: i,
      reason: 'r',
    })),
  });

  it('names the failures when there are any', () => {
    expect(routeCopySummary(mk(7, 2))).toBe("7 added, 2 couldn't be mapped");
  });

  it('says nothing about failures when there are none', () => {
    expect(routeCopySummary(mk(7, 0))).toBe('7 added');
  });

  it('never reports a clean copy while stops were skipped', () => {
    // The whole reason this helper is named rather than inlined: a caller that
    // builds "N added" by hand produces exactly the silent drop.
    expect(routeCopySummary(mk(0, 3))).toMatch(/3/);
  });
});
