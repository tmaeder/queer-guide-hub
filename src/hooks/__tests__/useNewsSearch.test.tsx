import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useNewsSearch } from '../useNewsSearch';

const { searchFetch } = vi.hoisted(() => ({ searchFetch: vi.fn() }));
vi.mock('@/lib/searchFetch', () => ({
  searchFetch,
  isSearchUnavailable: () => false,
  SEARCH_UNAVAILABLE_MESSAGE: 'Search unavailable',
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
