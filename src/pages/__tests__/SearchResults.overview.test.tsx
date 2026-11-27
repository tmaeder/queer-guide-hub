/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const flatCalls: Array<{ enabled?: boolean }> = [];
const trackClick = vi.fn();
const overviewState = {
  groups: [
    {
      type: 'city',
      total: 2,
      hits: [
        { objectID: 'c1', title: 'Berlin', type: 'city', slug: 'berlin' },
        { objectID: 'c2', title: 'Berlin, Connecticut', type: 'city', slug: 'berlin-ct' },
      ],
    },
    {
      type: 'event',
      total: 561,
      hits: [{ objectID: 'e1', title: 'Fausthouse', type: 'event', slug: 'fausthouse' }],
    },
  ],
  supported: true,
  failedTypes: [] as string[],
  facets: {},
  totalHits: 2906,
  loading: false,
  error: null,
  errorKind: null as null | 'unavailable',
  refetch: vi.fn(),
};

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
// Stable, like the real hook's EMPTY_RESULTS: the page compares results by
// identity, so a fresh array per render would loop.
const flatResponse = {
  results: [],
  facets: {},
  loading: false,
  totalHits: 0,
  resultsKey: 'k',
  refetch: vi.fn(),
};
vi.mock('@/hooks/useSearch', () => ({
  useSearchOverview: () => overviewState,
  useSearch: (...args: unknown[]) => {
    flatCalls.push((args[5] as { enabled?: boolean }) ?? {});
    return flatResponse;
  },
}));
vi.mock('@/hooks/useSearchActions', () => ({
  useTrackClick: () => trackClick,
  useFeedbackVote: () => vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useActiveTrip', () => ({
  useActiveTrip: () => ({ activeTrip: null, candidateTrips: [] }),
  useOptionalActiveTrip: () => null,
}));

import SearchResults from '../SearchResults';

function CurrentQuery() {
  return <output data-testid="qs">{useLocation().search}</output>;
}
// Result cards carry add-to-trip and feedback buttons, which use TanStack queries.
const renderAt = (url: string) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[url]}>
        <SearchResults />
        <CurrentQuery />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('SearchResults overview (All tab)', () => {
  beforeEach(() => {
    flatCalls.length = 0;
    trackClick.mockClear();
  });

  it('shows one section per type, in the worker order, and does not fetch the flat list', () => {
    renderAt('/search?q=berlin');
    const sections = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(sections[0]).toMatch(/Cities/);
    expect(sections[1]).toMatch(/Events/);
    expect(screen.getByTestId('search-section-city')).toHaveTextContent('Berlin, Connecticut');
    expect(flatCalls.length).toBeGreaterThan(0);
    expect(flatCalls.every((o) => o.enabled === false)).toBe(true);
  });

  it('shows "See all" only where a type has more than it shows, and it opens that scope', () => {
    renderAt('/search?q=berlin');
    const city = screen.getByTestId('search-section-city');
    // Cities shows both of its 2 results, so there is nothing more to see.
    expect(within(city).queryByRole('button', { name: /See all/ })).toBeNull();
    expect(within(city).getByRole('heading', { level: 2 })).toHaveTextContent(/Cities\s*2/);
    const events = screen.getByTestId('search-section-event');
    // The test i18n does not interpolate, so match the label, not the number;
    // the count itself is asserted on the heading and the scope chip.
    fireEvent.click(within(events).getByRole('button', { name: /See all/ }));
    expect(screen.getByTestId('qs').textContent).toContain('types=event');
  });

  it('puts exact per-type counts on the scope chips', () => {
    renderAt('/search?q=berlin');
    const scope = screen.getByRole('group', { name: 'Search scope' });
    expect(within(scope).getByRole('button', { name: /Events\s*561/ })).toBeInTheDocument();
    expect(within(scope).getByRole('button', { name: /Venues\s*0/ })).toBeInTheDocument();
  });

  it('hides sort and view controls, which do not apply to the overview', () => {
    renderAt('/search?q=berlin');
    expect(screen.queryByRole('combobox', { name: 'Sort' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Result view' })).toBeNull();
  });

  it('records the section and position of an overview click', () => {
    renderAt('/search?q=berlin');
    const events = screen.getByTestId('search-section-event');
    fireEvent.click(within(events).getByRole('link', { name: /Fausthouse/ }));
    expect(trackClick).toHaveBeenCalledWith(
      { type: 'event', id: 'e1' },
      'search',
      expect.objectContaining({ query: 'berlin', view: 'overview', section: 'event', position: 0 }),
    );
  });

  it('falls back to the flat list when the overview request fails', () => {
    overviewState.errorKind = 'unavailable';
    try {
      renderAt('/search?q=berlin');
      expect(screen.queryByTestId('search-section-city')).toBeNull();
      expect(flatCalls.some((o) => o.enabled === true)).toBe(true);
    } finally {
      overviewState.errorKind = null;
    }
  });

  it('shows no count for a type whose search failed, and names it with a retry', () => {
    overviewState.failedTypes = ['venue', 'news'];
    overviewState.refetch.mockClear();
    try {
      renderAt('/search?q=berlin');
      const scope = screen.getByRole('group', { name: 'Search scope' });
      // Failed: no number at all, never a false 0.
      expect(within(scope).getByRole('button', { name: /^Venues$/ })).toBeInTheDocument();
      expect(within(scope).getByRole('button', { name: /^News$/ })).toBeInTheDocument();
      // Searched and empty: still 0.
      expect(within(scope).getByRole('button', { name: /Tags\s*0/ })).toBeInTheDocument();
      const notice = screen.getByTestId('search-overview-partial');
      // The test i18n does not interpolate; the names are covered by the prod e2e.
      expect(notice).toHaveTextContent(/did not load/);
      fireEvent.click(within(notice).getByRole('button', { name: 'Try again' }));
      expect(overviewState.refetch).toHaveBeenCalled();
    } finally {
      overviewState.failedTypes = [];
    }
  });

  it('falls back to the flat list when every section failed, instead of claiming no results', () => {
    const groups = overviewState.groups;
    overviewState.groups = [];
    overviewState.failedTypes = ['city', 'event', 'venue'];
    try {
      renderAt('/search?q=berlin');
      expect(screen.queryByTestId('search-overview-partial')).toBeNull();
      expect(flatCalls.some((o) => o.enabled === true)).toBe(true);
    } finally {
      overviewState.groups = groups;
      overviewState.failedTypes = [];
    }
  });

  it('keeps the flat list when a scope is selected', () => {
    renderAt('/search?q=berlin&types=event');
    expect(screen.queryByTestId('search-section-city')).toBeNull();
    expect(flatCalls.some((o) => o.enabled === true)).toBe(true);
    expect(screen.getByRole('group', { name: 'Result view' })).toBeInTheDocument();
  });
});
