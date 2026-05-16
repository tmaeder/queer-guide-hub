/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const EMPTY: never[] = [];

vi.mock('@/hooks/useMarketplace', () => ({
  useMarketplace: () => ({
    listings: EMPTY, total: 0, pageSize: 24, loading: false, loadingTimedOut: false, error: null,
    fetchListings: vi.fn(), toggleFavorite: vi.fn(), incrementViews: vi.fn(),
  }),
}));

import { MarketplaceFilteredView } from '../MarketplaceFilteredView';

describe('MarketplaceFilteredView', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><MarketplaceFilteredView filters={{}} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
