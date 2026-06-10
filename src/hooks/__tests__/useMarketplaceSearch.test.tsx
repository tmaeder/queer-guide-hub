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
  // The rows query chains .in() twice (id filter + SFW content_rating
  // filter, added in PR #1538), so the builder must be a self-returning
  // thenable — a plain mockResolvedValueOnce breaks on the second .in().
  const rowResults: Array<{ data: unknown; error: unknown }> = [];
  const builder: Record<string, unknown> = {};
  const inFn = vi.fn(() => builder);
  const eqFn = vi.fn(() => builder);
  builder.in = inFn;
  builder.eq = eqFn;
  builder.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(rowResults.shift() ?? { data: [], error: null }).then(onFulfilled);
  const selectFn = vi.fn(() => builder);
  const fromFn = vi.fn(() => ({ select: selectFn }));
  const rpcFn = vi.fn(() => Promise.resolve({ data: [], error: null }));
  return {
    from: fromFn,
    rpc: rpcFn,
    _select: selectFn,
    _eq: eqFn,
    _in: inFn,
    _queueRows: (r: { data: unknown; error: unknown }) => rowResults.push(r),
    _rowResults: rowResults,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: supabaseMock,
}));

vi.mock('@/utils/fetchWithRetry', () => ({
  queryWithRetry: async (run: () => Promise<unknown>) => run(),
}));

beforeEach(() => {
  searchFetchMock.mockReset();
  supabaseMock._in.mockClear();
  supabaseMock.from.mockClear();
  supabaseMock._rowResults.length = 0;
});

describe('useMarketplace search routing', () => {
  it('routes filters.search through search-proxy and fetches rows by id', async () => {
    // Search-proxy returns three hit IDs.
    searchFetchMock.mockResolvedValueOnce({
      hits: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      totalHits: 3,
    });
    // Supabase resolves the three full rows.
    supabaseMock._queueRows({
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
