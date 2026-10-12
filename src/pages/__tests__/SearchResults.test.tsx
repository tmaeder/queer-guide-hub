/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
const { searchMock } = vi.hoisted(() => ({
  searchMock: vi.fn((_query: string, _filters: { priceRange?: number[] }, ..._args: unknown[]) => ({
    results: [],
    loading: false,
    totalHits: 0,
  })),
}));
vi.mock('@/hooks/useSearch', () => ({ useSearch: searchMock }));
vi.mock('@/hooks/usePreferenceChips', () => ({
  usePreferenceChips: () => ({ chips: [], toggle: vi.fn(), forget: vi.fn() }),
  priceRangeFromChips: () => [20, 60],
}));
vi.mock('@/hooks/useSearchActions', () => ({
  useTrackClick: () => vi.fn(),
  useFeedbackVote: () => vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import SearchResults from '../SearchResults';

describe('SearchResults', () => {
  beforeEach(() => searchMock.mockClear());
  it.each(['all', 'city', 'country', 'news'])(
    'keeps saved budgets out of %s search results',
    (scope) => {
      const path = '/search?q=germany' + (scope === 'all' ? '' : '&types=' + scope);
      render(
        <MemoryRouter initialEntries={[path]}>
          <SearchResults />
        </MemoryRouter>,
      );
      const filters = searchMock.mock.calls.at(-1)?.[1] as { priceRange?: number[] } | undefined;
      expect(filters?.priceRange).toBeUndefined();
    },
  );

  it.each(['venue', 'event', 'marketplace'])(
    'applies the saved budget within the %s scope',
    (scope) => {
      render(
        <MemoryRouter initialEntries={['/search?q=germany&types=' + scope]}>
          <SearchResults />
        </MemoryRouter>,
      );
      const filters = searchMock.mock.calls.at(-1)?.[1] as { priceRange?: number[] } | undefined;
      expect(filters?.priceRange).toEqual([20, 60]);
    },
  );

  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter>
        <SearchResults />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
