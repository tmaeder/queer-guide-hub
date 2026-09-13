/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useMarketplace', () => ({ useMarketplace: () => ({ items: [], isLoading: false }) }));
const useMeta = vi.fn();
vi.mock('@/hooks/useMeta', () => ({ useMeta: (o: unknown) => useMeta(o) }));
vi.mock('@/hooks/usePageFetchers', () => ({
  useMarketplaceItem: () => ({ data: null, isLoading: false }),
  fetchMarketplaceItemById: vi.fn().mockResolvedValue(null),
  fetchSimilarMarketplaceItems: vi.fn().mockResolvedValue([]),
  fetchMarketplaceListingBundle: vi.fn().mockResolvedValue(null),
  toggleMarketplaceFavorite: vi.fn(),
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
  beforeEach(() => {
    useMeta.mockClear();
  });

  it('renders without crashing', () => {
    const { container } = render(wrap());
    expect(container).toBeTruthy();
  });

  it('noindexes a missing listing instead of leaving the title default and the canonical self-referential', async () => {
    // The listing branch never called useMeta with `noIndex` at all — a dead
    // /marketplace/:slug published the plain default title with a canonical
    // pointing at itself, same soft-404 shape as TagDetail's fix.
    render(wrap());
    await waitFor(() => {
      const last = useMeta.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(last?.noIndex).toBe(true);
    });
    const last = useMeta.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(last?.title).toBe('No listing here.');
  });
});
