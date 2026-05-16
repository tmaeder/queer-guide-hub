import { describe, it, expect, beforeEach, vi } from 'vitest';

type MockResult = { data: unknown; error: { message: string } | null };

const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
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
            return (...args: unknown[]) => {
              record.chain.push({ method: prop, args });
              return builder;
            };
          },
        },
      );
      return builder;
    },
  },
}));

import {
  fetchTripSuggestionCities,
  fetchTripSuggestionVenues,
  fetchTripMapVenues,
  fetchTripMapEvents,
  fetchTripSuggestionEvents,
} from '../useTripSuggestions';

function withResults(...r: MockResult[]) { state.results.push(...r); }

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('fetchTripSuggestionCities', () => {
  it('returns [] for empty input without supabase call', async () => {
    expect(await fetchTripSuggestionCities([])).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });

  it('queries cities with countries join filtered by id list', async () => {
    withResults({ data: [{ id: 'c1', name: 'Berlin' }], error: null });
    const r = await fetchTripSuggestionCities(['c1', 'c2']);
    expect(r[0].id).toBe('c1');

    const inCall = state.calls[0].chain.find(s => s.method === 'in');
    expect(inCall?.args).toEqual(['id', ['c1', 'c2']]);
  });

  it('throws on error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    await expect(fetchTripSuggestionCities(['c1'])).rejects.toEqual({ message: 'rls' });
  });
});

describe('fetchTripSuggestionVenues', () => {
  it('queries venues with duplicate filter + foursquare order + limit 30', async () => {
    withResults({ data: [{ id: 'v1' }], error: null });
    await fetchTripSuggestionVenues(['c1']);

    const call = state.calls[0];
    expect(call.table).toBe('venues');
    expect(call.chain.find(s => s.method === 'is')?.args).toEqual(['duplicate_of_id', null]);
    expect(call.chain.find(s => s.method === 'limit')?.args).toEqual([30]);
    const order = call.chain.find(s => s.method === 'order');
    expect(order?.args[0]).toBe('foursquare_rating');
  });

  it('returns [] for empty input', async () => {
    expect(await fetchTripSuggestionVenues([])).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });
});

describe('fetchTripMapVenues', () => {
  it('adds latitude/longitude not-null filters and limit 50', async () => {
    withResults({ data: [{ id: 'v1' }], error: null });
    await fetchTripMapVenues(['c1']);

    const call = state.calls[0];
    const notNulls = call.chain.filter(s => s.method === 'not');
    expect(notNulls.map(n => (n.args as [string, string, unknown])[0])).toEqual(['latitude', 'longitude']);
    expect(call.chain.find(s => s.method === 'limit')?.args).toEqual([50]);
  });
});

describe('fetchTripMapEvents', () => {
  it('applies date-range gte/lte when provided', async () => {
    withResults({ data: [], error: null });
    await fetchTripMapEvents(['c1'], '2026-06-01', '2026-06-30');

    const call = state.calls[0];
    const gte = call.chain.find(s => s.method === 'gte');
    const lte = call.chain.find(s => s.method === 'lte');
    expect(gte?.args).toEqual(['start_date', '2026-06-01']);
    expect(lte?.args).toEqual(['start_date', '2026-06-30']);
  });

  it('omits gte/lte when dates not given', async () => {
    withResults({ data: [], error: null });
    await fetchTripMapEvents(['c1'], undefined, undefined);

    const call = state.calls[0];
    expect(call.chain.some(s => s.method === 'gte')).toBe(false);
    expect(call.chain.some(s => s.method === 'lte')).toBe(false);
  });

  it('returns [] for empty city list', async () => {
    expect(await fetchTripMapEvents([], undefined, undefined)).toEqual([]);
  });
});

describe('fetchTripSuggestionEvents', () => {
  it('applies city + duplicate filter, date range, order asc + limit 20', async () => {
    withResults({ data: [{ id: 'e1' }], error: null });
    await fetchTripSuggestionEvents(['c1'], '2026-06-01', '2026-06-30');

    const call = state.calls[0];
    expect(call.table).toBe('events');
    expect(call.chain.find(s => s.method === 'in')?.args).toEqual(['city_id', ['c1']]);
    expect(call.chain.find(s => s.method === 'is')?.args).toEqual(['duplicate_of_id', null]);
    expect(call.chain.find(s => s.method === 'limit')?.args).toEqual([20]);
  });
});
