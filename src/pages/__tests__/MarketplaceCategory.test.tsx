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
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

import MarketplaceCategory from '../MarketplaceCategory';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/marketplace/category/:slug?" element={<MarketplaceCategory />} /></Routes>
    </MemoryRouter>,
  );
}

describe('MarketplaceCategory', () => {
  it('shows not-found when slug missing', () => {
    renderAt('/marketplace/category/');
    expect(screen.getByText(/Category not found/i)).toBeInTheDocument();
  });

  it('renders prettified header + passes slug to filtered view', () => {
    renderAt('/marketplace/category/home_decor');
    expect(screen.getByRole('heading', { name: 'Home Decor' })).toBeInTheDocument();
    expect(screen.getByTestId('filtered')).toHaveTextContent('home_decor');
  });
});
