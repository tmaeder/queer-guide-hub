/**
 * @vitest-environment jsdom
 *
 * Verifies the marketplace search wiring: when filters.search is set,
 * useMarketplace must route the query through the search-proxy worker
 * (via searchFetch) and then fetch the matched rows by id from
 * Supabase. The old Postgres .or(ilike) path is the fallback only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const searchFetchMock = vi.fn();
vi.mock('@/lib/searchFetch', () => ({
  searchFetch: (...args: unknown[]) => searchFetchMock(...args),
}));

const supabaseMock = vi.hoisted(() => {
  const inFn = vi.fn();
  const eqFn = vi.fn(() => ({ in: inFn }));
  const selectFn = vi.fn(() => ({ eq: eqFn }));
  const fromFn = vi.fn(() => ({ select: selectFn }));
  const rpcFn = vi.fn(() => Promise.resolve({ data: [], error: null }));
  return { from: fromFn, rpc: rpcFn, _select: selectFn, _eq: eqFn, _in: inFn };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: supabaseMock,
}));

vi.mock('@/utils/fetchWithRetry', () => ({
  queryWithRetry: async (run: () => Promise<unknown>) => run(),
}));

beforeEach(() => {
  searchFetchMock.mockReset();
  supabaseMock._in.mockReset();
  supabaseMock.from.mockClear();
});

describe('useMarketplace search routing', () => {
  it('routes filters.search through search-proxy and fetches rows by id', async () => {
    // Search-proxy returns three hit IDs.
    searchFetchMock.mockResolvedValueOnce({
      hits: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      totalHits: 3,
    });
    // Supabase resolves the three full rows.
    supabaseMock._in.mockResolvedValueOnce({
      data: [
        { id: 'a', title: 'Alpha', slug: 'alpha' },
        { id: 'b', title: 'Bravo', slug: 'bravo' },
        { id: 'c', title: 'Charlie', slug: 'charlie' },
      ],
      error: null,
    });

    const { useMarketplace } = await import('../useMarketplace');
    const { result } = renderHook(() => useMarketplace());

    await act(async () => {
      await result.current.fetchListings({ search: 'M2193 Low Rise Brief' }, 0, 'relevance');
    });

    expect(searchFetchMock).toHaveBeenCalledTimes(1);
    const [path, body] = searchFetchMock.mock.calls[0];
    expect(path).toBe('/');
    expect((body as { query: string }).query).toBe('M2193 Low Rise Brief');
    expect((body as { filters: { types: string[] } }).filters.types).toEqual(['marketplace']);
    // search-proxy expects 0-based page indices — passing 1 here would
    // skip the first page worth of hits and miss narrow queries.
    expect((body as { page: number }).page).toBe(0);

    await waitFor(() => expect(result.current.total).toBe(3));
    expect(result.current.listings.map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('short queries (< 2 chars) skip search and fall through to the catalog path', async () => {
    // Catalog path uses .select(..., { count: 'exact' }) — we don't need
    // to model it fully here; just ensure search-proxy is not called.
    const { useMarketplace } = await import('../useMarketplace');
    const { result } = renderHook(() => useMarketplace());

    await act(async () => {
      try {
        await result.current.fetchListings({ search: 'a' }, 0, 'relevance');
      } catch {
        /* the catalog path isn't fully mocked, that's fine */
      }
    });

    expect(searchFetchMock).not.toHaveBeenCalled();
  });
});
