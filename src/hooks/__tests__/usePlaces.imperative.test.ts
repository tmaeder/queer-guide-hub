/**
 * Tests for the imperative async exports in usePlaces.tsx —
 * fetchCitiesByCountry, searchLocations, findNearbyCities.
 *
 * The hook exports themselves wrap these with TanStack Query and are
 * better covered by component-level integration tests.
 */
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

function withResults(...results: MockResult[]) {
  state.results.push(...results);
}

import {
  fetchCitiesByCountry,
  searchLocations,
  findNearbyCities,
} from '../usePlaces';

beforeEach(() => {
  state.calls.length = 0;
  state.results.length = 0;
});

describe('fetchCitiesByCountry', () => {
  it('filters by country_id and excludes duplicates', async () => {
    withResults({
      data: [{ id: 'c1', name: 'Berlin', countries: { id: 'de' } }],
      error: null,
    });

    const result = await fetchCitiesByCountry('de');

    expect(result).toEqual([
      { id: 'c1', name: 'Berlin', countries: { id: 'de' } },
    ]);
    const c = state.calls[0];
    expect(c.table).toBe('cities');
    const eqCall = c.chain.find(s => s.method === 'eq');
    expect(eqCall?.args).toEqual(['country_id', 'de']);
  });

  it('returns empty array when data is null', async () => {
    withResults({ data: null, error: null });
    const result = await fetchCitiesByCountry('de');
    expect(result).toEqual([]);
  });

  it('throws when supabase returns an error', async () => {
    withResults({ data: null, error: { message: 'boom' } });
    await expect(fetchCitiesByCountry('de')).rejects.toEqual({ message: 'boom' });
  });
});

describe('searchLocations', () => {
  it('fans out to countries and cities tables in parallel', async () => {
    withResults(
      { data: [{ id: 'de', name: 'Germany' }], error: null },
      { data: [{ id: 'c1', name: 'Berlin' }], error: null },
    );

    const result = await searchLocations('ger');

    expect(result).toEqual({
      countries: [{ id: 'de', name: 'Germany' }],
      cities: [{ id: 'c1', name: 'Berlin' }],
    });
    expect(state.calls.map(c => c.table)).toEqual(['countries', 'cities']);
  });

  it('returns empty arrays when both queries return null data', async () => {
    withResults(
      { data: null, error: null },
      { data: null, error: null },
    );

    const result = await searchLocations('xx');
    expect(result).toEqual({ countries: [], cities: [] });
  });
});

describe('findNearbyCities', () => {
  const here = { latitude: 52.52, longitude: 13.405 }; // Berlin

  it('computes distance and filters to <=500 km, sorted ascending', async () => {
    withResults({
      data: [
        { id: 'c1', name: 'Berlin', latitude: 52.52, longitude: 13.405, countries: {} },
        { id: 'c2', name: 'Hamburg', latitude: 53.55, longitude: 9.99, countries: {} },
        { id: 'c3', name: 'Tokyo', latitude: 35.68, longitude: 139.69, countries: {} },
      ],
      error: null,
    });

    const result = await findNearbyCities(here);

    expect(result.map(c => c.name)).toEqual(['Berlin', 'Hamburg']);
    expect(result[0].distance).toBeLessThan(1);
    expect(result[1].distance).toBeGreaterThan(200);
    expect(result[1].distance).toBeLessThan(350);
  });

  it('returns empty array when data is null', async () => {
    withResults({ data: null, error: null });
    const result = await findNearbyCities(here);
    expect(result).toEqual([]);
  });

  it('throws when supabase returns an error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    await expect(findNearbyCities(here)).rejects.toEqual({ message: 'rls' });
  });
});
