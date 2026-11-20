import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * fetchEventsInBbox filters on the server. Until 2026-11-20 it fetched the
 * soonest 1000 future events worldwide and filtered in JS, so a city viewport
 * showed whatever share of the planet's next 1000 events fell inside it.
 * These tests record every PostgREST call the fetcher makes.
 */

type Call = [string, ...unknown[]];
const queries: { select: string; calls: Call[] }[] = [];
const results = vi.hoisted(() => ({ byQuery: [] as unknown[][], delayMs: 0 }));

function recorder(index: number) {
  const q = queries[index];
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          const p = new Promise((r) => setTimeout(r, results.delayMs)).then(() => ({
            data: results.byQuery[index] ?? [],
            error: null,
          }));
          return p.then.bind(p);
        }
        return (...args: unknown[]) => {
          q.calls.push([prop, ...args]);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: (select: string) => {
        queries.push({ select, calls: [] });
        return recorder(queries.length - 1);
      },
    }),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: () => {
    const p = Promise.resolve({ data: [], error: null });
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, prop) => (prop === 'then' ? p.then.bind(p) : () => proxy),
      },
    );
    return proxy;
  },
}));

import { fetchEventsInBbox } from '../useViewportPoints';

const BBOX = { north: 52.6, south: 52.4, east: 13.5, west: 13.3 };
const has = (calls: Call[], ...want: unknown[]) =>
  calls.some((c) => want.every((w, i) => c[i] === w));
const ev = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  slug: id,
  title: `Event ${id}`,
  start_date: '2099-01-01T20:00:00Z',
  latitude: 52.5,
  longitude: 13.4,
  ...extra,
});

beforeEach(() => {
  queries.length = 0;
  results.byQuery = [];
  results.delayMs = 0;
});

describe('fetchEventsInBbox', () => {
  it('bounds the own-coordinates query by the viewport', async () => {
    await fetchEventsInBbox(BBOX, undefined);
    const own = queries.find((q) => !q.select.includes('!inner'));
    expect(own, 'no own-coordinates query').toBeDefined();
    expect(has(own!.calls, 'gte', 'latitude', 52.4)).toBe(true);
    expect(has(own!.calls, 'lte', 'latitude', 52.6)).toBe(true);
    expect(has(own!.calls, 'gte', 'longitude', 13.3)).toBe(true);
    expect(has(own!.calls, 'lte', 'longitude', 13.5)).toBe(true);
  });

  it('finds events placed only by their venue, bounded by the venue', async () => {
    await fetchEventsInBbox(BBOX, undefined);
    const byVenue = queries.find((q) => q.select.includes('!inner'));
    expect(byVenue, 'no venue-coordinates query').toBeDefined();
    expect(has(byVenue!.calls, 'is', 'latitude', null)).toBe(true);
    expect(has(byVenue!.calls, 'gte', 'venues.latitude', 52.4)).toBe(true);
    expect(has(byVenue!.calls, 'lte', 'venues.latitude', 52.6)).toBe(true);
    expect(has(byVenue!.calls, 'gte', 'venues.longitude', 13.3)).toBe(true);
    expect(has(byVenue!.calls, 'lte', 'venues.longitude', 13.5)).toBe(true);
  });

  it('merges both queries and drops duplicates', async () => {
    results.byQuery = [
      [ev('a'), ev('b')],
      [
        ev('b'),
        ev('c', {
          latitude: null,
          longitude: null,
          venues: { name: 'V', latitude: 52.5, longitude: 13.4 },
        }),
      ],
    ];
    const features = await fetchEventsInBbox(BBOX, undefined);
    expect(features.map((f) => f.properties.id).sort()).toEqual(['event-a', 'event-b', 'event-c']);
  });

  it('shows a recurring series once when no date range is set', async () => {
    await fetchEventsInBbox(BBOX, undefined);
    expect(queries).toHaveLength(2);
    for (const q of queries) {
      expect(has(q.calls, 'eq', 'series_next', true)).toBe(true);
      expect(has(q.calls, 'is', 'parent_event_id', null)).toBe(true);
    }
  });

  it('shows every date inside a chosen date range', async () => {
    await fetchEventsInBbox(BBOX, { dateRange: { start: '2099-01-01', end: '2099-01-31' } });
    expect(queries).toHaveLength(2);
    for (const q of queries) {
      // Positive control: the range is applied, so the filter list is not empty.
      expect(has(q.calls, 'lte', 'start_date', '2099-01-31')).toBe(true);
      expect(has(q.calls, 'eq', 'series_next', true)).toBe(false);
    }
  });
});

describe('useViewportPoints request sharing', () => {
  it('sends one request per layer when the viewport is reported twice on load', async () => {
    const { renderHook, waitFor } = await import('@testing-library/react');
    const { useViewportPoints } = await import('../useViewportPoints');
    // A bbox no other test uses, so nothing is cached yet.
    const bbox = { north: -33.8, south: -33.95, east: 151.3, west: 151.1 };
    const { result } = renderHook(() =>
      useViewportPoints({ enabledLayers: ['events'], filters: {} }),
    );
    results.delayMs = 400;
    result.current.onViewportChange(bbox, 12);
    // Past the debounce, so the first fetch has started and is still waiting.
    await new Promise((r) => setTimeout(r, 300));
    expect(queries.length, 'the first fetch never started').toBe(2);
    // The second report lands before the first request resolves.
    result.current.onViewportChange(bbox, 12);
    await new Promise((r) => setTimeout(r, 300));
    await waitFor(() => expect(result.current.isFetching).toBe(false), { timeout: 3000 });
    expect(queries.length).toBe(2); // own-coordinates + venue-coordinates, once each
  });
});
