/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

vi.mock('@/hooks/useMarketplaceQueries', () => ({
  useMarketplaceFacets: () => ({
    data: {
      total: 6532,
      category: new Map([
        ['products', 6529],
        ['services', 3],
      ]),
      subcategory: new Map([
        ['fetish_gear', 3022],
        ['sex_toys', 3211],
        ['underwear', 291],
      ]),
      business_type: new Map(),
    },
    isLoading: false,
  }),
  useMarketplaceSubcategoryTiles: () => ({
    data: [
      { slug: 'sex_toys', count: 3211 },
      { slug: 'fetish_gear', count: 3022 },
      { slug: 'underwear', count: 291 },
    ],
    loading: false,
  }),
  useMarketplaceAttributeVocab: () => ({
    data: [
      { slug: 'mat-cotton', name: 'Cotton', kind: 'material' },
      { slug: 'occ-pride', name: 'Pride', kind: 'occasion' },
      { slug: 'vibe-minimal', name: 'Minimal', kind: 'vibe' },
    ],
    loading: false,
  }),
}));

// Suggestions dropdown needs router context + network — not under test here.
vi.mock('../MarketplaceSearchSuggestions', () => ({
  MarketplaceSearchSuggestions: () => null,
}));

import { MarketplaceFilters } from '../MarketplaceFilters';

describe('MarketplaceFilters', () => {
  it('renders without crashing', () => {
    const { container } = render(wrap(<MarketplaceFilters onFiltersChange={vi.fn()} />));
    expect(container).toBeTruthy();
  });

  it('leads with Department; subcategory + dead Type axis stay hidden until a department is chosen', () => {
    const { getByLabelText, queryByText } = render(
      wrap(<MarketplaceFilters onFiltersChange={vi.fn()} />),
    );
    // Open the panel.
    fireEvent.click(getByLabelText('Toggle filters'));
    expect(queryByText('Department')).toBeTruthy();
    // The products/services enum select was removed (99.98% products).
    expect(queryByText('Type')).toBeNull();
    // Subcategory renders only as a drill-down inside a department.
    expect(queryByText('Category')).toBeNull();
    expect(queryByText('Subcategory')).toBeNull();
  });

  it('Apply filters collapses the panel and fires onFiltersChange', () => {
    const onFiltersChange = vi.fn();
    const { getByText, getByLabelText, queryByText } = render(
      wrap(<MarketplaceFilters onFiltersChange={onFiltersChange} />),
    );
    fireEvent.click(getByLabelText('Toggle filters'));
    expect(queryByText('Apply filters')).toBeTruthy();
    fireEvent.click(getByText('Apply filters'));
    // Panel collapses → "Apply filters" no longer visible.
    expect(queryByText('Apply filters')).toBeNull();
    expect(onFiltersChange).toHaveBeenCalled();
  });
});
