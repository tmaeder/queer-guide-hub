/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import { Routes, Route } from 'react-router';

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
  return renderWithProviders(
    <Routes><Route path="/marketplace/merchants/:domain?" element={<MarketplaceMerchant />} /></Routes>,
    { route: path },
  );
}

describe('MarketplaceMerchant', () => {
  it('shows not-found when domain missing, with a way back up the line', () => {
    renderAt('/marketplace/merchants/');
    // Copy moved from "Merchant not found" to the family's dead-end voice
    // (/404 "No stop here.", the maker page "No maker here.").
    expect(screen.getByText(/No such merchant/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All makers/i })).toBeInTheDocument();
  });

  it('renders merchant heading + visit link', () => {
    renderAt('/marketplace/merchants/queer-shop.com');
    expect(screen.getByRole('heading', { name: /Queer-shop/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Visit merchant site/i })).toHaveAttribute('href', 'https://queer-shop.com');
  });
});
