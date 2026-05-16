/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Stable references — fresh arrays on each render trigger infinite useEffect loops.
const EMPTY: never[] = [];

vi.mock('@/hooks/useMarketplace', () => ({
  useMarketplace: () => ({
    listings: EMPTY, total: 0, pageSize: 24, loading: false, loadingTimedOut: false, error: null,
    fetchListings: vi.fn(), toggleFavorite: vi.fn(), incrementViews: vi.fn(),
  }),
}));
vi.mock('@/hooks/useEntityImageAssets', () => ({ useEntityImageAssets: () => ({ assets: {} }) }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import Marketplace from '../Marketplace';

describe('Marketplace', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<MemoryRouter><QueryClientProvider client={qc}><Marketplace /></QueryClientProvider></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
