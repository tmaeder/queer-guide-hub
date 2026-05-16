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

import { fetchTripShares, createTripShare, deleteTripShare } from '../useTripShares';

function withResults(...r: MockResult[]) { state.results.push(...r); }
beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('fetchTripShares', () => {
  it('queries trip_shares filtered by trip_id newest first', async () => {
    withResults({ data: [{ id: 'sh1' }], error: null });
    await fetchTripShares('t1');
    expect(state.calls[0].chain.find(s => s.method === 'eq')?.args).toEqual(['trip_id', 't1']);
  });

  it('throws on error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    await expect(fetchTripShares('t1')).rejects.toEqual({ message: 'rls' });
  });
});

describe('createTripShare', () => {
  it('inserts with input fields', async () => {
    withResults({ data: { id: 'sh1', token: 'tok' }, error: null });
    const r = await createTripShare({
      tripId: 't1',
      createdBy: 'u1',
      permissions: { itinerary: true, budget: false, notes: false, packing: true },
      expiresAt: '2026-12-31',
    });
    expect(r.token).toBe('tok');
    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    expect(insert?.args[0]).toMatchObject({ trip_id: 't1', created_by: 'u1' });
  });

  it('throws on error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    await expect(
      createTripShare({ tripId: 't1', createdBy: null, permissions: { itinerary: true, budget: true, notes: true, packing: true }, expiresAt: null }),
    ).rejects.toEqual({ message: 'rls' });
  });
});

describe('deleteTripShare', () => {
  it('deletes by id', async () => {
    withResults({ data: null, error: null });
    await deleteTripShare('sh1');
    expect(state.calls[0].chain.some(s => s.method === 'delete')).toBe(true);
    expect(state.calls[0].chain.find(s => s.method === 'eq')?.args).toEqual(['id', 'sh1']);
  });
});
