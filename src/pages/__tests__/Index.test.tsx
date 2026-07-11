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
    stats: {
      venues: 3214,
      profiles: 900,
      cities: 56,
      countries: 120,
      events: 182,
      posts: null,
      personalities: null,
      groups: null,
      tags: null,
      marketplace: null,
      news: null,
      cms: null,
    },
    loading: false,
    error: null,
    refetch: vi.fn(),
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
  it('renders a visible h1 masthead with live stats', () => {
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
    const h1 = container.querySelector('h1');
    expect(h1).toBeTruthy();
    // The masthead h1 is visible (identity overlay), not sr-only.
    expect(h1?.className).not.toContain('sr-only');
    expect(h1?.textContent).toContain('Queer venues,');
  });
});
