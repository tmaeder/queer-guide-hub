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
  useMarketplaceRow,
  useMarketplaceSpotlight,
  useBrandSafeRow,
  BRAND_SAFE_DEPARTMENTS,
} from '../useMarketplaceRows';

function withResults(...r: MockResult[]) { state.results.push(...r); }

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useMarketplaceRow', () => {
  it("'featured' branch filters featured=true ordered by updated_at desc", async () => {
    withResults({ data: [{ id: 'l1' }], error: null });
    const { result } = renderHook(() => useMarketplaceRow('featured', 5));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data.map(l => l.id)).toEqual(['l1']);
    const eq = state.calls[0].chain.find(
      s => s.method === 'eq' && (s.args as [string, unknown])[0] === 'featured',
    );
    expect(eq?.args).toEqual(['featured', true]);
    const limit = state.calls[0].chain.find(s => s.method === 'limit');
    expect(limit?.args).toEqual([5]);
  });

  it("'new' branch filters by created_at gte 14d ago", async () => {
    withResults({ data: [], error: null });
    renderHook(() => useMarketplaceRow('new'));
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const gte = state.calls[0].chain.find(s => s.method === 'gte');
    expect(gte?.args[0]).toBe('created_at');
  });

  it("'most-relevant' filters by lgbti_relevance_score >= 0.5", async () => {
    withResults({ data: [], error: null });
    renderHook(() => useMarketplaceRow('most-relevant'));
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const gte = state.calls[0].chain.find(s => s.method === 'gte');
    expect(gte?.args).toEqual(['lgbti_relevance_score', 0.5]);
  });

  it("'price-drops' returns [] when no drops detected", async () => {
    // fetchPriceDropIds query returns no rows → fetchRow returns [] before
    // executing the marketplace_listings builder.
    withResults({ data: [], error: null });
    const { result } = renderHook(() => useMarketplaceRow('price-drops'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([]);
    // marketplace_listings .from() is registered eagerly (top of fetchRow)
    // but the builder is never .then()-awaited when ids is empty.
    expect(state.calls.some(c => c.table === 'marketplace_price_history')).toBe(true);
  });

  it("'price-drops' picks listings whose last price < first price", async () => {
    // First query: price_history — three rows for two listings. listing-A drops
    // from 100 → 80, listing-B stays at 50 (unchanged → filtered out).
    withResults(
      {
        data: [
          { listing_id: 'A', observed_at: '2026-04-01', price_usd: 100 },
          { listing_id: 'A', observed_at: '2026-04-15', price_usd: 80 },
          { listing_id: 'B', observed_at: '2026-04-01', price_usd: 50 },
        ],
        error: null,
      },
      { data: [{ id: 'A', title: 'Discounted' }], error: null },
    );

    const { result } = renderHook(() => useMarketplaceRow('price-drops'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data.map(l => (l as { id: string }).id)).toEqual(['A']);
    // Second call should be marketplace_listings .in('id', ['A']). The base
    // query also applies .in('content_rating', SFW_RATINGS), so look up the
    // id-keyed .in specifically rather than the first .in in the chain.
    const listingsCall = state.calls.find(c => c.table === 'marketplace_listings');
    const inCall = listingsCall?.chain.find(s => s.method === 'in' && s.args?.[0] === 'id');
    expect(inCall?.args).toEqual(['id', ['A']]);
  });

  it('surfaces error state on supabase failure', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useMarketplaceRow('featured'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });
});

describe('useBrandSafeRow', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `l${i}` }));

  it('filters strictly sfw + brand-safe departments + community ownership', async () => {
    withResults({ data: rows(6), error: null });
    const { result } = renderHook(() => useBrandSafeRow(9));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toHaveLength(6);
    expect(result.current.ownedOnly).toBe(true);
    expect(state.calls).toHaveLength(1);

    const chain = state.calls[0].chain;
    const eqRating = chain.find(s => s.method === 'eq' && s.args[0] === 'content_rating');
    expect(eqRating?.args).toEqual(['content_rating', 'sfw']); // no 'suggestive'
    const inDept = chain.find(s => s.method === 'in' && s.args[0] === 'department');
    expect(inDept?.args).toEqual(['department', BRAND_SAFE_DEPARTMENTS]);
    expect(BRAND_SAFE_DEPARTMENTS).not.toContain('underwear');
    expect(BRAND_SAFE_DEPARTMENTS).not.toContain('swimwear');
    expect(BRAND_SAFE_DEPARTMENTS).not.toContain('intimacy');
    expect(BRAND_SAFE_DEPARTMENTS).not.toContain('bdsm_fetish');
    const overlaps = chain.find(s => s.method === 'overlaps');
    expect(overlaps?.args).toEqual(['community_owned_tags', ['queer_owned', 'trans_owned']]);
  });

  it('falls back to the ownership-unfiltered pool when < 4 owned items', async () => {
    withResults({ data: rows(2), error: null }, { data: rows(7), error: null });
    const { result } = renderHook(() => useBrandSafeRow(9));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toHaveLength(7);
    expect(result.current.ownedOnly).toBe(false);
    expect(state.calls).toHaveLength(2);
    // The fallback query keeps sfw + department filters but drops ownership.
    const chain = state.calls[1].chain;
    expect(chain.find(s => s.method === 'overlaps')).toBeUndefined();
    expect(chain.find(s => s.method === 'eq' && s.args[0] === 'content_rating')?.args).toEqual([
      'content_rating',
      'sfw',
    ]);
  });
});

describe('useMarketplaceSpotlight', () => {
  it('returns the first row from a featured + has-images query', async () => {
    withResults({
      data: [{ id: 'l1', title: 'Hero' }, { id: 'l2', title: 'Other' }],
      error: null,
    });

    const { result } = renderHook(() => useMarketplaceSpotlight());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.listing?.id).toBe('l1');

    const call = state.calls[0];
    const eqs = call.chain.filter(s => s.method === 'eq');
    const eqMap = Object.fromEntries(eqs.map(e => e.args as [string, unknown]));
    expect(eqMap.featured).toBe(true);
    expect(eqMap.status).toBe('active');
    const notNull = call.chain.find(s => s.method === 'not');
    expect(notNull?.args).toEqual(['images', 'is', null]);
  });

  it('returns null on error', async () => {
    withResults({ data: null, error: { message: 'fail' } });
    const { result } = renderHook(() => useMarketplaceSpotlight());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.listing).toBeNull();
  });
});
