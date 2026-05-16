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
      const builder: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (onFulfilled: (v: MockResult) => unknown) => {
              const next = state.results.shift() ?? { data: [], error: null };
              return Promise.resolve(next).then(onFulfilled);
            };
          }
          return (...args: unknown[]) => { record.chain.push({ method: prop, args }); return builder; };
        },
      });
      return builder;
    },
  },
}));

import {
  fetchTripDateRange,
  fetchTripPlaceCities,
  logTripBookingClick,
} from '../useBundledCheckout';

function withResults(...r: MockResult[]) { state.results.push(...r); }
beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('fetchTripDateRange', () => {
  it('queries trips by id and returns start/end', async () => {
    withResults({ data: { start_date: '2026-06-01', end_date: '2026-06-05' }, error: null });
    const r = await fetchTripDateRange('t1');
    expect(r?.start_date).toBe('2026-06-01');
    expect(state.calls[0].table).toBe('trips');
    expect(state.calls[0].chain.find(s => s.method === 'eq')?.args).toEqual(['id', 't1']);
  });

  it('returns null when no row', async () => {
    withResults({ data: null, error: null });
    expect(await fetchTripDateRange('t1')).toBeNull();
  });
});

describe('fetchTripPlaceCities', () => {
  it('queries trip_places joined to cities filtered by trip_id', async () => {
    withResults({ data: [{ city_id: 'c1', cities: { id: 'c1', name: 'Berlin' } }], error: null });
    const r = await fetchTripPlaceCities('t1');
    expect(r[0].cities?.name).toBe('Berlin');
    expect(state.calls[0].table).toBe('trip_places');
    expect(state.calls[0].chain.find(s => s.method === 'eq')?.args).toEqual(['trip_id', 't1']);
  });
});

describe('logTripBookingClick', () => {
  it('inserts into trip_booking_clicks', async () => {
    withResults({ data: null, error: null });
    await logTripBookingClick({
      trip_id: 't1',
      trip_place_id: 'tp1',
      user_id: 'u1',
      provider: 'Booking',
      vertical: 'hotel',
      destination_url: 'https://booking.com/x',
    });
    expect(state.calls[0].table).toBe('trip_booking_clicks');
    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    expect(insert?.args[0]).toMatchObject({ trip_id: 't1', provider: 'Booking' });
  });
});
