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

import { fetchPersonalizedCitiesByIds, fetchTrendingCities } from '../usePersonalizedCities';

function withResults(...r: MockResult[]) { state.results.push(...r); }
beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('fetchPersonalizedCitiesByIds', () => {
  it('returns [] for empty ids without supabase call', async () => {
    expect(await fetchPersonalizedCitiesByIds([])).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });

  it('queries cities by .in("id", ids)', async () => {
    withResults({ data: [{ id: 'c1', name: 'Berlin' }], error: null });
    await fetchPersonalizedCitiesByIds(['c1', 'c2']);
    expect(state.calls[0].chain.find(s => s.method === 'in')?.args).toEqual(['id', ['c1', 'c2']]);
  });
});

describe('fetchTrendingCities', () => {
  it('uses default minPopulation 500000 + limit 6', async () => {
    withResults({ data: [], error: null });
    await fetchTrendingCities();
    expect(state.calls[0].chain.find(s => s.method === 'gte')?.args).toEqual(['population', 500000]);
    expect(state.calls[0].chain.find(s => s.method === 'limit')?.args).toEqual([6]);
  });

  it('honors custom args', async () => {
    withResults({ data: [], error: null });
    await fetchTrendingCities(1_000_000, 3);
    expect(state.calls[0].chain.find(s => s.method === 'gte')?.args).toEqual(['population', 1_000_000]);
    expect(state.calls[0].chain.find(s => s.method === 'limit')?.args).toEqual([3]);
  });
});
