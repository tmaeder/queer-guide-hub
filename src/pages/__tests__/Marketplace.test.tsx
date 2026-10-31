/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Stable references — fresh arrays on each render trigger infinite useEffect loops.
const EMPTY: never[] = [];

vi.mock('@/hooks/useMarketplace', () => ({
  useMarketplace: () => ({
    listings: EMPTY,
    total: 0,
    pageSize: 24,
    loading: false,
    loadingTimedOut: false,
    error: null,
    fetchListings: vi.fn(),
    toggleFavorite: vi.fn(),
    incrementViews: vi.fn(),
  }),
}));
vi.mock('@/hooks/useEntityImageAssets', () => ({ useEntityImageAssets: () => ({ assets: {} }) }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
// MarketplaceCard reads useCurrency; bare render has no CurrencyProvider.
vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({
    currency: 'USD',
    setCurrency: vi.fn(),
    rates: {},
    formatPrice: (n: number) => `$${n}`,
    convertPrice: (n: number) => n,
    loading: false,
  }),
}));

vi.mock('@/components/guides/GuidesRail', () => ({
  GuidesRail: () => <div data-testid="guides-rail" />,
}));
vi.mock('@/components/marketplace/OccasionChips', () => ({
  OccasionChips: () => <div data-testid="collection-chips" />,
}));

import Marketplace from '../Marketplace';

describe('Marketplace', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <Marketplace />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  it('puts the "End of line" block after everything else in the tail', () => {
    // It announces the end of the page, so nothing may run on past it. It used
    // to sit after the spotlight, with the collection chips and the buying
    // guides below it.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <Marketplace />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    const end = screen.getByRole('heading', { name: 'Every maker on this line' });
    for (const id of ['collection-chips', 'guides-rail']) {
      expect(
        screen.getByTestId(id).compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});
