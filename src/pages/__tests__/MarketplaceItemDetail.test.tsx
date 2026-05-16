/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ items: [], isLoading: false }) }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/usePageFetchers', () => ({
  useMarketplaceItem: () => ({ data: null, isLoading: false }),
  fetchMarketplaceItemById: vi.fn().mockResolvedValue(null),
  fetchSimilarMarketplaceItems: vi.fn().mockResolvedValue([]),
}));

import MarketplaceItemDetail from '../MarketplaceItemDetail';

function wrap(initialPath = '/marketplace/m1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={qc}>
        <Routes><Route path="/marketplace/:id" element={<MarketplaceItemDetail />} /></Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('MarketplaceItemDetail', () => {
  it('renders without crashing', () => {
    const { container } = render(wrap());
    expect(container).toBeTruthy();
  });
});
