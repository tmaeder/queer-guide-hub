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
  fetchBookingAssistantCities,
  fetchTripReservations,
  fetchBookingAssistantVenues,
} from '../useTripBookingAssistant';

function withResults(...r: MockResult[]) { state.results.push(...r); }

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('fetchBookingAssistantCities', () => {
  it('short-circuits when cityIds is empty', async () => {
    const r = await fetchBookingAssistantCities([]);
    expect(r).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });

  it('filters by .in(id, cityIds) on cities', async () => {
    withResults({ data: [{ id: 'c1', name: 'Berlin' }], error: null });
    const r = await fetchBookingAssistantCities(['c1', 'c2']);
    expect(r.map(c => c.id)).toEqual(['c1']);
    const inCall = state.calls[0].chain.find(s => s.method === 'in');
    expect(inCall?.args).toEqual(['id', ['c1', 'c2']]);
  });

  it('throws on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    await expect(fetchBookingAssistantCities(['c1'])).rejects.toEqual({ message: 'rls' });
  });
});

describe('fetchTripReservations', () => {
  it('filters reservations by trip_id', async () => {
    withResults({ data: [{ id: 'r1', type: 'hotel' }], error: null });
    const r = await fetchTripReservations('trip-1');
    expect(r[0].id).toBe('r1');
    expect(state.calls[0].table).toBe('reservations');
    const eqCall = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eqCall?.args).toEqual(['trip_id', 'trip-1']);
  });
});

describe('fetchBookingAssistantVenues', () => {
  it('returns [] for empty cityIds without hitting supabase', async () => {
    expect(await fetchBookingAssistantVenues([])).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });

  it('queries venues by city, ordered by rating desc, limited to 20', async () => {
    withResults({ data: [{ id: 'v1', name: 'Berghain' }], error: null });
    const r = await fetchBookingAssistantVenues(['c1']);
    expect(r[0].id).toBe('v1');

    const call = state.calls[0];
    expect(call.table).toBe('venues');
    const inCall = call.chain.find(s => s.method === 'in');
    expect(inCall?.args[0]).toBe('city_id');
    const orderCall = call.chain.find(s => s.method === 'order');
    expect(orderCall?.args[0]).toBe('foursquare_rating');
    const limitCall = call.chain.find(s => s.method === 'limit');
    expect(limitCall?.args).toEqual([20]);
  });

  it('throws on supabase error', async () => {
    withResults({ data: null, error: { message: 'fail' } });
    await expect(fetchBookingAssistantVenues(['c1'])).rejects.toEqual({ message: 'fail' });
  });
});
