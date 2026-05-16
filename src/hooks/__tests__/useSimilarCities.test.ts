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

import { fetchSimilarCitiesPool, fetchSameCountryCities } from '../useSimilarCities';

function withResults(...r: MockResult[]) { state.results.push(...r); }
beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('fetchSimilarCitiesPool', () => {
  it('excludes the source city, filters population >= 100k, honors limit', async () => {
    withResults({ data: [{ id: 'c1' }], error: null });
    await fetchSimilarCitiesPool('c-self', 5);

    const call = state.calls[0];
    expect(call.table).toBe('cities');
    expect(call.chain.find(s => s.method === 'neq')?.args).toEqual(['id', 'c-self']);
    expect(call.chain.find(s => s.method === 'gte')?.args).toEqual(['population', 100000]);
    expect(call.chain.find(s => s.method === 'limit')?.args).toEqual([5]);
  });
});

describe('fetchSameCountryCities', () => {
  it('filters by country_id + excludes city + population >= 50k + limit 3', async () => {
    withResults({ data: [], error: null });
    await fetchSameCountryCities('co-1', 'c-self');

    const call = state.calls[0];
    expect(call.chain.find(s => s.method === 'eq')?.args).toEqual(['country_id', 'co-1']);
    expect(call.chain.find(s => s.method === 'neq')?.args).toEqual(['id', 'c-self']);
    expect(call.chain.find(s => s.method === 'gte')?.args).toEqual(['population', 50000]);
    expect(call.chain.find(s => s.method === 'limit')?.args).toEqual([3]);
  });
});
