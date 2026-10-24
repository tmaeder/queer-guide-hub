/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test/test-utils';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    loading: false,
    hasPasskey: false,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signInWithOAuth: vi.fn(),
    resendVerification: vi.fn(),
    resetPassword: vi.fn(),
    signOut: vi.fn(),
    enrollPasskey: vi.fn(),
    signInWithPasskey: vi.fn(),
  }),
}));
const { requests } = vi.hoisted(() => ({
  requests: [] as Array<{ filters: Record<string, unknown>; sort?: string; paged: boolean }>,
}));
vi.mock('@/hooks/useVenues', () => ({
  useVenuesFeed: (request: { filters: Record<string, unknown>; sort?: string; paged: boolean }) => {
    requests.push(request);
    return {
      venues: [],
      loading: false,
      loadingMore: false,
      error: null,
      hasMore: false,
      datasetTotal: 0,
      filteredTotal: 0,
      loadMore: vi.fn(),
      refetch: vi.fn(),
      loadingTimedOut: false,
    };
  },
}));
vi.mock('@/hooks/useRecentVenues', () => ({
  useRecentVenues: () => ({ venues: [], loading: false }),
}));
vi.mock('@/hooks/useEvents', () => ({
  useEventsQuery: () => ({ events: [], loading: false, isFetching: false, error: null }),
}));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));

import Venues from '../Venues';

describe('Venues', () => {
  it('renders without crashing', () => {
    const { container } = renderWithProviders(<Venues />);
    expect(container).toBeTruthy();
  });

  // The request is derived from the URL. A shared or bookmarked link must
  // reach the FIRST request the page hands the feed, not a later correction.
  it('derives the first request from the URL', () => {
    requests.length = 0;
    renderWithProviders(<Venues />, {
      route: '/venues?category=bar&tags=leather,bears&city=Berlin&sort=name',
    });
    expect(requests[0]).toMatchObject({
      paged: true,
      sort: 'name',
      filters: { category: 'bar', city: 'Berlin', tags: ['leather', 'bears'] },
    });
  });

  it('a bare /venues requests no filters', () => {
    requests.length = 0;
    renderWithProviders(<Venues />, { route: '/venues' });
    const keys = Object.keys(requests[0].filters).filter((k) => k !== 'userLocation');
    expect(keys).toEqual([]);
  });
});
