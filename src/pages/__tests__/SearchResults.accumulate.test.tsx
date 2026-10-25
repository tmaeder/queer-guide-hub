/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Regression: the page accumulated pages under a key built from the raw URL
// query, while useSearch debounces it. For the debounce window the old
// query's results were filed under the new key, and the new query's results
// were then appended to them as if they were page 2 (prod: Paris results on
// the London page).
type Hit = { objectID: string; title: string; type: string };
let state: { results: Hit[]; resultsKey: string; loading: boolean } = {
  results: [],
  resultsKey: '',
  loading: false,
};
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({ ...state, totalHits: state.results.length, error: null, facets: {} }),
}));
vi.mock('@/hooks/useSearchActions', () => ({
  useTrackClick: () => vi.fn(),
  useFeedbackVote: () => vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useActiveTrip', () => ({
  useActiveTrip: () => ({ activeTrip: null, candidateTrips: [] }),
  useOptionalActiveTrip: () => null,
}));

import SearchResults from '../SearchResults';

const nav: { go: (to: string) => void } = { go: () => {} };
function Nav() {
  const navigate = useNavigate();
  useEffect(() => {
    nav.go = (to) => navigate(to);
  }, [navigate]);
  return null;
}

describe('SearchResults page accumulation', () => {
  it('does not carry the previous query results into a new search', () => {
    state = {
      results: [{ objectID: 'p1', title: 'Paris Bar', type: 'venue' }],
      resultsKey: 'paris',
      loading: false,
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // A fresh element each time: React skips re-rendering an identical one.
    const ui = () => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/search?q=paris']}>
          <Nav />
          <SearchResults />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const { rerender } = render(ui());
    expect(screen.getByText('Paris Bar')).toBeTruthy();

    // URL moves on; the hook is still debouncing and returns paris results.
    act(() => nav.go('/search?q=london'));
    rerender(ui());

    // The london request lands.
    state = {
      results: [{ objectID: 'l1', title: 'London Bar', type: 'venue' }],
      resultsKey: 'london',
      loading: false,
    };
    rerender(ui());
    expect(screen.getByText('London Bar')).toBeTruthy();
    expect(screen.queryByText('Paris Bar')).toBeNull();
  });
});
