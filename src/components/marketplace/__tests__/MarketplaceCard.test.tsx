/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { MarketplaceCard } from '../MarketplaceCard';

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({
    currency: 'GBP',
    setCurrency: () => {},
    formatPrice: (n: number) => `£${n}`,
    formatPriceCents: (c: number) => `£${(c / 100).toFixed(2)}`,
    symbol: '£',
    loading: false,
  }),
}));

vi.mock('@/hooks/useFxRates', () => ({
  useFxRates: () => ({ data: { USD: 1, EUR: 1.08, GBP: 1.27 } }),
}));

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('MarketplaceCard', () => {
  it('renders loading state', () => {
    const { container } = render(wrap(<MarketplaceCard loading />));
    expect(container).toBeTruthy();
  });

  it('renders listing', () => {
    const { container } = render(
      wrap(
        <MarketplaceCard
          listing={{ id: 'm1', title: 'Item', slug: 'item', price: 10, currency: 'USD' } as never}
        />,
      ),
    );
    expect(container).toBeTruthy();
  });

  it('boutique card: no per-card CTA, monetized listings carry an Ad marker', () => {
    const { container, getByText } = render(
      wrap(
        <MarketplaceCard
          listing={
            {
              id: 'm3',
              title: 'Aff Item',
              slug: 'aff',
              price: 10,
              currency: 'USD',
              source_type: 'awin',
              external_url: 'https://example.com/aff',
              affiliate_url: 'https://www.awin1.com/cread.php?ued=x',
            } as never
          }
        />,
      ),
    );
    // Outbound CTA moved to the detail page — no external link on the card.
    expect(container.querySelector('a[target="_blank"]')).toBeNull();
    expect(getByText('Ad')).toBeTruthy();
  });

  it('shows a Queer-owned badge from community_owned_tags', () => {
    const { getByText } = render(
      wrap(
        <MarketplaceCard
          listing={
            {
              id: 'm4',
              title: 'Owned Item',
              slug: 'owned',
              price: 10,
              currency: 'USD',
              community_owned_tags: ['queer_owned'],
            } as never
          }
        />,
      ),
    );
    expect(getByText('Queer-owned')).toBeTruthy();
  });

  it('priority={true} sets loading="eager" + fetchpriority="high"', () => {
    const { container } = render(
      wrap(
        <MarketplaceCard
          listing={
            {
              id: 'p1',
              title: 'P1',
              slug: 'p1',
              price: 5,
              currency: 'USD',
              images: ['https://queer.guide/img.png'],
            } as never
          }
          priority
        />,
      ),
    );
    const img = container.querySelector('img') as HTMLImageElement | null;
    expect(img?.getAttribute('loading')).toBe('eager');
    expect(img?.getAttribute('fetchpriority')).toBe('high');
  });

  it('priority={false} keeps native loading="lazy"', () => {
    const { container } = render(
      wrap(
        <MarketplaceCard
          listing={
            {
              id: 'p2',
              title: 'P2',
              slug: 'p2',
              price: 5,
              currency: 'USD',
              images: ['https://queer.guide/img.png'],
            } as never
          }
        />,
      ),
    );
    const img = container.querySelector('img') as HTMLImageElement | null;
    expect(img?.getAttribute('loading')).toBe('lazy');
  });

  it('shows ≈ in selected display currency (GBP), not USD, for a non-USD listing', () => {
    const { getByText } = render(
      wrap(
        <MarketplaceCard
          listing={
            {
              id: 'm2',
              title: 'EU Item',
              slug: 'eu-item',
              price: 32,
              price_usd: 34.56,
              currency: 'EUR',
              price_type: 'fixed',
            } as never
          }
        />,
      ),
    );
    const approxLine = getByText(/≈/);
    expect(approxLine.textContent).toMatch(/£|GBP/);
    expect(approxLine.textContent).not.toMatch(/\$/);
  });
});
