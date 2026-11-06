import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useNewsSearch } from '../useNewsSearch';

const { searchFetch } = vi.hoisted(() => ({ searchFetch: vi.fn() }));
vi.mock('@/lib/searchFetch', () => ({
  searchFetch,
  isSearchUnavailable: () => false,
  SEARCH_UNAVAILABLE_MESSAGE: 'Search unavailable',
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({
    select: () => ({
      in: (_field: string, ids: string[]) => ({
        abortSignal: async () => ({ data: ids.map((id) => ({ id })), error: null }),
      }),
    }),
  }) },
}));

it('keeps the newest result count when an earlier request finishes later', async () => {
  let releaseOld = (_response: object) => {};
  searchFetch
    .mockImplementationOnce(() => new Promise<object>((resolve) => { releaseOld = resolve; }))
    .mockResolvedValueOnce({ hits: [], totalHits: 17 });
  const { result } = renderHook(() => useNewsSearch());

  let first: Promise<void> | undefined;
  act(() => { first = result.current.searchArticles('old search'); });
  await act(async () => result.current.searchArticles('new search'));
  expect(searchFetch.mock.calls[0][2].signal.aborted).toBe(true);
  expect(result.current.totalHits).toBe(17);

  await act(async () => {
    releaseOld({ hits: [], totalHits: 99 });
    await first;
  });
  expect(result.current.totalHits).toBe(17);
  expect(result.current.loading).toBe(false);
});


it('appends the next page and keeps earlier results if that request fails', async () => {
  searchFetch.mockReset()
    .mockResolvedValueOnce({ hits: [{ type: 'news', objectID: 'first' }], totalHits: 25 })
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValueOnce({
      hits: [{ type: 'news', objectID: 'first' }, { type: 'news', objectID: 'second' }],
      totalHits: 25,
    });
  const { result } = renderHook(() => useNewsSearch());

  await act(async () => result.current.searchArticles('Berlin'));
  expect(result.current.nextPage).toBe(1);
  await act(async () => result.current.searchArticles('Berlin', {}, 1));
  expect(result.current.error).toBeTruthy();
  expect(result.current.articles).toEqual([{ id: 'first' }]);
  expect(result.current.nextPage).toBe(1);
  await act(async () => result.current.searchArticles('Berlin', {}, 1));
  expect(result.current.articles).toEqual([{ id: 'first' }, { id: 'second' }]);
  expect(result.current.nextPage).toBeNull();
});

it('fills pending facet counts from a facetsOnly follow-up that the page write cannot wipe', async () => {
  searchFetch.mockReset().mockImplementation(async (_path: string, body: Record<string, unknown>) =>
    body.facetsOnly
      ? { hits: [], facetDistribution: { tags: { pride: 3 } } }
      : { hits: [{ type: 'news', objectID: 'a' }], totalHits: 1, facetDistribution: {}, facetsPending: true },
  );
  const { result } = renderHook(() => useNewsSearch());
  await act(async () => result.current.searchArticles('pride march'));
  await act(async () => {});
  expect(searchFetch.mock.calls).toHaveLength(2);
  expect(searchFetch.mock.calls[1][1]).toMatchObject({ query: 'pride march', facetsOnly: true });
  expect(result.current.facets).toEqual({ tags: { pride: 3 } });
  expect(result.current.articles).toEqual([{ id: 'a' }]);
});
