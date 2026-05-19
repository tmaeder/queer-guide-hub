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
  it('queries the editorial whitelist by name first', async () => {
    withResults({ data: [], error: null }, { data: [], error: null });
    await fetchTrendingCities();
    const inCall = state.calls[0].chain.find(s => s.method === 'in');
    expect(inCall?.args[0]).toBe('name');
    const names = inCall?.args[1] as string[];
    expect(names).toContain('Berlin');
    expect(names).toContain('Mexico City');
    expect(names).toContain('Bangkok');
  });

  it('preserves whitelist order, not the order supabase returns', async () => {
    // Supabase returns Bangkok first, then Berlin — but Berlin appears earlier
    // in FEATURED_CITY_WHITELIST so it must be surfaced first.
    withResults({
      data: [
        { id: 'bkk', name: 'Bangkok', population: 10_000_000, countries: null },
        { id: 'ber', name: 'Berlin', population: 3_700_000, countries: null },
      ],
      error: null,
    });
    const result = await fetchTrendingCities(0, 2);
    expect(result.map(r => r.name)).toEqual(['Berlin', 'Bangkok']);
  });

  it('falls back to equality-filtered population query when whitelist is empty', async () => {
    withResults(
      { data: [], error: null },
      { data: [{ id: 'x', name: 'Fallback', population: 5_000_000, countries: null }], error: null },
    );
    const result = await fetchTrendingCities();
    expect(result.map(r => r.name)).toEqual(['Fallback']);
    const popGte = state.calls[1].chain.find(s => s.method === 'gte' && s.args[0] === 'population');
    expect(popGte?.args).toEqual(['population', 200000]);
    const eqGte = state.calls[1].chain.find(s => s.method === 'gte' && s.args[0] === 'countries.equality_score');
    expect(eqGte?.args).toEqual(['countries.equality_score', 60]);
  });
});
