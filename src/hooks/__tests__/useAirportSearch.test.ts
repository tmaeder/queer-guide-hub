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
          return (...args: unknown[]) => {
            record.chain.push({ method: prop, args });
            return builder;
          };
        },
      });
      return builder;
    },
  },
}));

import { fetchAirportByIata, searchAirports } from '../useAirportSearch';

function withResults(...r: MockResult[]) { state.results.push(...r); }
beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('fetchAirportByIata', () => {
  it('queries airports filtered to iata_code', async () => {
    withResults({ data: { iata_code: 'BER', city_name: 'Berlin', country_code: 'DE' }, error: null });
    const r = await fetchAirportByIata('BER');
    expect(r?.city_name).toBe('Berlin');
    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['iata_code', 'BER']);
  });

  it('returns null when no match', async () => {
    withResults({ data: null, error: null });
    expect(await fetchAirportByIata('XXX')).toBeNull();
  });
});

describe('searchAirports', () => {
  it('builds or() clause across city/name/iata + limit 30', async () => {
    withResults({ data: [{ iata_code: 'BER' }], error: null });
    await searchAirports('ber');
    const or = state.calls[0].chain.find(s => s.method === 'or');
    const clause = or?.args[0] as string;
    expect(clause).toContain('city_name.ilike.%ber%');
    expect(clause).toContain('name.ilike.%ber%');
    expect(clause).toContain('iata_code.ilike.%ber%');
    expect(state.calls[0].chain.find(s => s.method === 'limit')?.args).toEqual([30]);
  });

  it('returns [] when data is null', async () => {
    withResults({ data: null, error: null });
    expect(await searchAirports('x')).toEqual([]);
  });
});
