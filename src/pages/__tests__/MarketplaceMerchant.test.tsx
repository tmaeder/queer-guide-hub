/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import { Routes, Route } from 'react-router';

vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: (p: { title: string; subtitle?: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{p.title}</h1>
      <span>{p.subtitle}</span>
      {p.actions}
    </div>
  ),
}));
vi.mock('@/components/marketplace/MarketplaceFilteredView', () => ({
  MarketplaceFilteredView: () => <div data-testid="filtered" />,
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

const merchantName = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('@/hooks/useMarketplaceMerchants', () => ({
  useMerchantPublicName: () => ({ data: merchantName.value }),
}));
vi.mock('@/components/guides/GuidesRail', () => ({
  GuidesRail: () => <div data-testid="guides-rail" />,
}));

import MarketplaceMerchant from '../MarketplaceMerchant';

function renderAt(path: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/marketplace/merchants/:domain?" element={<MarketplaceMerchant />} />
    </Routes>,
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

  it('noindexes a missing domain instead of shipping the plain "Merchant" title indexable', () => {
    renderAt('/marketplace/merchants/');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex,nofollow',
    );
  });

  it('renders merchant heading + visit link', () => {
    renderAt('/marketplace/merchants/queer-shop.com');
    expect(screen.getByRole('heading', { name: /Queer-shop/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Visit merchant site/i })).toHaveAttribute(
      'href',
      'https://queer-shop.com',
    );
  });

  it("titles the page with the seller's own name when its listings carry one", () => {
    merchantName.value = 'Marek+Richard';
    renderAt('/marketplace/merchants/marekrichard.com');
    expect(screen.getByRole('heading', { level: 1, name: 'Marek+Richard' })).toBeInTheDocument();
    merchantName.value = null;
  });

  it('puts the unscoped guides rail after the listings, not above them', () => {
    renderAt('/marketplace/merchants/queer-shop.com');
    expect(
      screen.getByTestId('filtered').compareDocumentPosition(screen.getByTestId('guides-rail')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
