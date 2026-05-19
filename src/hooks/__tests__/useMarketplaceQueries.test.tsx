/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

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
  useMarketplaceSubcategoryTiles,
  useMarketplaceListingsRelated,
  useMarketplaceTopCities,
  useMarketplaceListingsForCity,
  useMarketplaceListingsForVenue,
  useMarketplaceSimilarListings,
  useMarketplaceFacets,
  useMarketplacePriceHistory,
} from '../useMarketplaceQueries';

function withResults(...r: MockResult[]) { state.results.push(...r); }

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useMarketplaceSubcategoryTiles', () => {
  it('aggregates, ranks, and hides subcategories with fewer than 5 listings', async () => {
    const rep = (slug: string, n: number) =>
      Array.from({ length: n }, () => ({ subcategory: slug }));
    withResults({
      data: [
        ...rep('art', 12),
        ...rep('fashion', 8),
        ...rep('jewelry', 5),
        ...rep('rare', 2),
        { subcategory: null },
      ],
      error: null,
    });

    const { result } = renderHook(() => useMarketplaceSubcategoryTiles());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([
      { slug: 'art', count: 12 },
      { slug: 'fashion', count: 8 },
      { slug: 'jewelry', count: 5 },
    ]);
  });

  it('returns [] on error', async () => {
    withResults({ data: null, error: { message: 'fail' } });
    const { result } = renderHook(() => useMarketplaceSubcategoryTiles());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);
  });
});

describe('useMarketplaceListingsRelated', () => {
  it('queries active listings with priority orders + limit', async () => {
    withResults({
      data: [{ id: 'l1', title: 'Pin' }, { id: 'l2', title: 'Tote' }],
      error: null,
    });
    const { result } = renderHook(() => useMarketplaceListingsRelated(2));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data.map(l => l.id)).toEqual(['l1', 'l2']);
    const call = state.calls[0];
    expect(call.table).toBe('marketplace_listings');
    const limit = call.chain.find(s => s.method === 'limit');
    expect(limit?.args).toEqual([2]);
  });
});

describe('useMarketplaceTopCities', () => {
  it('aggregates listings by city with slug, ranks top N', async () => {
    withResults({
      data: [
        { venues: { city: 'Berlin', cities: { slug: 'berlin' } } },
        { venues: { city: 'Berlin', cities: { slug: 'berlin' } } },
        { venues: { city: 'Paris', cities: { slug: 'paris' } } },
        { venues: null },
        { venues: { city: null } },
      ],
      error: null,
    });

    const { result } = renderHook(() => useMarketplaceTopCities(5));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([
      { name: 'Berlin', slug: 'berlin', count: 2 },
      { name: 'Paris', slug: 'paris', count: 1 },
    ]);
  });
});

describe('useMarketplaceListingsForCity', () => {
  it('returns [] when cityName is undefined without hitting supabase', async () => {
    const { result } = renderHook(() => useMarketplaceListingsForCity(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });

  it('filters by venues.city when cityName is provided', async () => {
    withResults({ data: [{ id: 'l1' }], error: null });
    const { result } = renderHook(() => useMarketplaceListingsForCity('Berlin'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data.map(l => l.id)).toEqual(['l1']);
    const eqCalls = state.calls[0].chain.filter(s => s.method === 'eq');
    const eqMap = Object.fromEntries(eqCalls.map(c => c.args as [string, unknown]));
    expect(eqMap['venues.city']).toBe('Berlin');
    expect(eqMap.status).toBe('active');
  });
});

describe('useMarketplaceListingsForVenue', () => {
  it('returns [] when venueId is undefined without hitting supabase', async () => {
    const { result } = renderHook(() => useMarketplaceListingsForVenue(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(state.calls).toHaveLength(0);
  });

  it('filters by venue_id when provided', async () => {
    withResults({ data: [{ id: 'l1' }], error: null });
    const { result } = renderHook(() => useMarketplaceListingsForVenue('v1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const eqCall = state.calls[0].chain.find(
      s => s.method === 'eq' && (s.args as [string, unknown])[0] === 'venue_id',
    );
    expect(eqCall?.args).toEqual(['venue_id', 'v1']);
  });
});

describe('useMarketplaceSimilarListings', () => {
  it('returns [] when listing is null', async () => {
    const { result } = renderHook(() => useMarketplaceSimilarListings(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(state.calls).toHaveLength(0);
  });

  it('prefers category_id over category when both present', async () => {
    withResults({ data: [{ id: 'l2' }], error: null });
    const listing = { id: 'l1', category_id: 'cat-1', category: 'pins' } as never;
    renderHook(() => useMarketplaceSimilarListings(listing));
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const eqs = state.calls[0].chain.filter(s => s.method === 'eq');
    const cols = eqs.map(e => (e.args as [string, unknown])[0]);
    expect(cols).toContain('category_id');
    expect(cols).not.toContain('category');
  });

  it('falls back to category when category_id is missing', async () => {
    withResults({ data: [], error: null });
    const listing = { id: 'l1', category_id: null, category: 'pins' } as never;
    renderHook(() => useMarketplaceSimilarListings(listing));
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const eqs = state.calls[0].chain.filter(s => s.method === 'eq');
    const cols = eqs.map(e => (e.args as [string, unknown])[0]);
    expect(cols).toContain('category');
    expect(cols).not.toContain('category_id');
  });

  it('excludes the current listing via .neq', async () => {
    withResults({ data: [], error: null });
    renderHook(() =>
      useMarketplaceSimilarListings({ id: 'l1', category: 'pins' } as never),
    );
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const neq = state.calls[0].chain.find(s => s.method === 'neq');
    expect(neq?.args).toEqual(['id', 'l1']);
  });
});

describe('useMarketplaceFacets', () => {
  it('aggregates category / subcategory / business_type Maps + total', async () => {
    withResults({
      data: [
        { category: 'art', subcategory: 'prints', business_type: 'individual' },
        { category: 'art', subcategory: 'prints', business_type: 'individual' },
        { category: 'art', subcategory: 'paintings', business_type: 'business' },
        { category: 'fashion', subcategory: null, business_type: 'business' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useMarketplaceFacets({}));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data.total).toBe(4);
    expect(result.current.data.category.get('art')).toBe(3);
    expect(result.current.data.category.get('fashion')).toBe(1);
    expect(result.current.data.subcategory.get('prints')).toBe(2);
    expect(result.current.data.subcategory.get('paintings')).toBe(1);
    // Null subcategory not counted.
    expect(result.current.data.subcategory.size).toBe(2);
    expect(result.current.data.business_type.get('individual')).toBe(2);
    expect(result.current.data.business_type.get('business')).toBe(2);
  });

  it('returns EMPTY_FACETS on error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useMarketplaceFacets({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data.total).toBe(0);
    expect(result.current.data.category.size).toBe(0);
  });

  it('applies filter eq() calls when scoped', async () => {
    withResults({ data: [], error: null });
    renderHook(() =>
      useMarketplaceFacets({ category: 'art', businessType: 'business' }),
    );
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const eqCols = state.calls[0].chain
      .filter(s => s.method === 'eq')
      .map(e => (e.args as [string, unknown])[0]);
    expect(eqCols).toContain('category');
    expect(eqCols).toContain('business_type');
    expect(eqCols).toContain('status');
  });
});

describe('useMarketplacePriceHistory', () => {
  it('returns price points filtered to numeric price_usd', async () => {
    withResults({
      data: [
        { observed_at: '2026-04-01', price_usd: 19.99 },
        { observed_at: '2026-04-08', price_usd: 22.5 },
        { observed_at: '2026-04-15', price_usd: null },
      ],
      error: null,
    });

    const { result } = renderHook(() => useMarketplacePriceHistory('l1', 30));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([
      { observed_at: '2026-04-01', price_usd: 19.99 },
      { observed_at: '2026-04-08', price_usd: 22.5 },
    ]);

    const call = state.calls[0];
    expect(call.table).toBe('marketplace_price_history');
    const eq = call.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['listing_id', 'l1']);
  });

  it('returns [] on error', async () => {
    withResults({ data: null, error: { message: 'fail' } });
    const { result } = renderHook(() => useMarketplacePriceHistory('l1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);
  });
});
