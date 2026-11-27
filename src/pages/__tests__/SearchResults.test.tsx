/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useSearch', () => {
  const response = {
    results: [],
    facets: { city: { Berlin: 26 } },
    loading: false,
    totalHits: 0,
    resultsKey: 'test',
    refetch: vi.fn(),
  };
  // These cases cover the flat list; an overview the worker does not support
  // makes the page fall back to it. SearchResults.overview.test.tsx covers the overview.
  const overview = {
    groups: [],
    supported: false,
    facets: {},
    totalHits: 0,
    loading: false,
    error: null,
    errorKind: null,
    refetch: vi.fn(),
  };
  return { useSearch: () => response, useSearchOverview: () => overview };
});
vi.mock('@/hooks/useSearchActions', () => ({
  useTrackClick: () => vi.fn(),
  useFeedbackVote: () => vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import SearchResults from '../SearchResults';

describe('SearchResults', () => {
  it('makes the city in a venue query an explicit, shareable refinement', () => {
    function CurrentQuery() {
      return <output>{useLocation().search}</output>;
    }
    render(
      <MemoryRouter initialEntries={['/search?q=sauna+Berlin&types=venue']}>
        <SearchResults />
        <CurrentQuery />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Search in / }));
    expect(screen.getByText('?q=sauna+Berlin&types=venue&location=Berlin')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Search in / })).not.toBeInTheDocument();
  });

  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter>
        <SearchResults />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
