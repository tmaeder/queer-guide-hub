/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: (p: { title: string }) => <h1>{p.title}</h1>,
}));
vi.mock('@/components/marketplace/MarketplaceFilteredView', () => ({
  MarketplaceFilteredView: (p: { filters: { subcategory?: string } }) => (
    <div data-testid="filtered">{p.filters.subcategory}</div>
  ),
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('@/hooks/useMarketplaceQueries', () => ({
  useMarketplaceSubcategoryGroupCounts: () => ({
    data: [
      { slug: 'tops', count: 10 },
      { slug: 'bottoms', count: 5 },
    ],
    loading: false,
  }),
  useMarketplaceTagFacets: () => ({ data: [] }),
  useMarketplaceFineCounts: () => ({ data: [] }),
}));
vi.mock('@/components/guides/GuidesRail', () => ({ GuidesRail: () => null }));

import MarketplaceCategory from '../MarketplaceCategory';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/marketplace/category/:slug?" element={<MarketplaceCategory />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MarketplaceCategory', () => {
  it('shows not-found when slug missing, with a way back up the line', () => {
    renderAt('/marketplace/category/');
    // Copy moved from "Category not found" to the family's dead-end voice
    // (/404 "No stop here.", the maker page "No maker here.").
    expect(screen.getByText(/No such category/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All categories/i })).toBeInTheDocument();
  });

  it('renders prettified header + passes slug to filtered view', () => {
    renderAt('/marketplace/category/home_decor');
    expect(screen.getByRole('heading', { name: 'Home Decor' })).toBeInTheDocument();
    expect(screen.getByTestId('filtered')).toHaveTextContent('home_decor');
  });

  it('names the chosen group in the heading, not only the department', () => {
    // The categories index links "Tops" to /apparel?g=tops; the h1 used to stay
    // "Apparel" while the breadcrumb and grid both meant tops.
    renderAt('/marketplace/category/apparel?g=tops');
    expect(screen.getByRole('heading', { level: 1, name: 'Tops' })).toBeInTheDocument();
    expect(screen.getByText(/Marketplace · Apparel/)).toBeInTheDocument();
  });

  it('keeps the department as the heading when no group is chosen, with no stock lede', () => {
    renderAt('/marketplace/category/apparel');
    expect(screen.getByRole('heading', { level: 1, name: 'Apparel' })).toBeInTheDocument();
    expect(screen.queryByText(/products and services in this category/)).toBeNull();
  });
});
