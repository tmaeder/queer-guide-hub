/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useConsolidatedStats', () => ({
  useConsolidatedStats: () => ({
    stats: { venues: 0, cities: 0, countries: 0, events: 0, news: 0, users: 0 },
    loading: false,
    error: null,
  }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useVisitorLocation', () => ({
  useVisitorLocation: () => ({ location: null, loading: false }),
}));

// Heavy children pull their own data/providers (maplibre, etc.) — stub them so
// this stays a composition smoke test for Index itself.
vi.mock('@/components/map/MapShell', () => ({
  default: () => <div data-testid="map-shell" />,
}));
vi.mock('@/components/home/RecentlyViewedRail', () => ({
  RecentlyViewedRail: () => null,
}));

import Index from '../Index';

describe('Index', () => {
  it('renders without crashing', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Index />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });
});
