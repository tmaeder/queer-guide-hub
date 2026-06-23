/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

type MockResult = { data: unknown; error: { message: string } | null };

const state = vi.hoisted(() => ({ results: [] as MockResult[] }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from() {
      const builder: unknown = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (onFulfilled: (v: MockResult) => unknown) => {
                const next = state.results.shift() ?? { data: [], error: null };
                return Promise.resolve(next).then(onFulfilled);
              };
            }
            return () => builder;
          },
        },
      );
      return builder;
    },
  },
}));

import { resolveEntityGeo, tripPlaceRowFromGeo } from '../resolveEntityGeo';

beforeEach(() => {
  state.results = [];
});

describe('resolveEntityGeo', () => {
  it('resolves and keys venues + events by id', async () => {
    // First query = venues, second = events (Promise.all array order).
    state.results.push(
      {
        data: [
          {
            id: 'v1',
            name: 'Bar One',
            category: 'bar',
            address: '1 St',
            latitude: 1,
            longitude: 2,
            city_id: 'c1',
            country_id: 'co1',
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: 'e1',
            title: 'Pride',
            event_type: 'festival',
            latitude: 3,
            longitude: 4,
            city_id: 'c1',
            country_id: 'co1',
          },
        ],
        error: null,
      },
    );

    const map = await resolveEntityGeo([
      { type: 'venue', id: 'v1' },
      { type: 'event', id: 'e1' },
    ]);

    expect(map.get('v1')).toMatchObject({ type: 'venue', name: 'Bar One', city_id: 'c1' });
    expect(map.get('e1')).toMatchObject({ type: 'event', name: 'Pride', category: 'festival' });
  });

  it('returns an empty map for no refs without querying', async () => {
    const map = await resolveEntityGeo([]);
    expect(map.size).toBe(0);
  });

  it('builds a trip_places row with the venue id and category', () => {
    const row = tripPlaceRowFromGeo({
      id: 'v1',
      type: 'venue',
      name: 'Bar One',
      city_id: 'c1',
      country_id: 'co1',
      latitude: 1,
      longitude: 2,
      address: '1 St',
      category: 'bar',
    });
    expect(row).toMatchObject({ venue_id: 'v1', event_id: null, category: 'venue', city_id: 'c1' });
  });
});
