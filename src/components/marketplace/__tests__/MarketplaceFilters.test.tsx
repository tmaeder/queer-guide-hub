/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useMarketplaceQueries', () => ({
  useMarketplaceFacets: () => ({ data: { categories: [], subcategories: [], brands: [] }, isLoading: false }),
}));

import { MarketplaceFilters } from '../MarketplaceFilters';

describe('MarketplaceFilters', () => {
  it('renders without crashing', () => {
    const { container } = render(<MarketplaceFilters onFiltersChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
