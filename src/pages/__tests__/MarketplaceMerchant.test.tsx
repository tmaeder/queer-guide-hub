/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: (p: { title: string; subtitle?: string; actions?: React.ReactNode }) => (
    <div><h1>{p.title}</h1><span>{p.subtitle}</span>{p.actions}</div>
  ),
}));
vi.mock('@/components/marketplace/MarketplaceFilteredView', () => ({
  MarketplaceFilteredView: () => <div data-testid="filtered" />,
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

import MarketplaceMerchant from '../MarketplaceMerchant';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/marketplace/merchants/:domain?" element={<MarketplaceMerchant />} /></Routes>
    </MemoryRouter>,
  );
}

describe('MarketplaceMerchant', () => {
  it('shows not-found when domain missing', () => {
    renderAt('/marketplace/merchants/');
    expect(screen.getByText(/Merchant not found/i)).toBeInTheDocument();
  });

  it('renders merchant heading + visit link', () => {
    renderAt('/marketplace/merchants/queer-shop.com');
    expect(screen.getByRole('heading', { name: /Queer-shop/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Visit merchant site/i })).toHaveAttribute('href', 'https://queer-shop.com');
  });
});
