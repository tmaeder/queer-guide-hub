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
