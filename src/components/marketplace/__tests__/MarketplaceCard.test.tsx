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

  it('outbound CTA renders with explicit inverted color (label legible)', () => {
    const { container } = render(
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
            } as never
          }
        />,
      ),
    );
    const cta = container.querySelector('a[aria-label*="opens in new tab"]') as HTMLAnchorElement | null;
    expect(cta).toBeTruthy();
    expect(cta!.textContent?.toLowerCase()).toMatch(/shop|visit/);
    // Inline style guarantees color won't be clobbered by Tailwind preflight
    // `a { color: inherit }`. We assert both inline declarations are present.
    expect(cta!.style.color).toMatch(/var\(--background\)/);
    expect(cta!.style.backgroundColor).toMatch(/var\(--foreground\)/);
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
