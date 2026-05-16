/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { hookMock } = vi.hoisted(() => ({ hookMock: vi.fn() }));

vi.mock('@/hooks/useMarketplaceQueries', () => ({ useMarketplacePriceHistory: hookMock }));
vi.mock('@/lib/currency', () => ({ formatCurrency: (v: number) => `$${v.toFixed(2)}` }));
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="chart">{children}</div>,
  Line: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
}));

import { MarketplacePriceHistory } from '../MarketplacePriceHistory';

beforeEach(() => hookMock.mockReset());

describe('MarketplacePriceHistory', () => {
  it('renders nothing with fewer than 2 points', () => {
    hookMock.mockReturnValue({ data: [{ price_usd: 10 }] });
    const { container } = render(<MarketplacePriceHistory listingId="l1" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows down arrow + percent for price drop', () => {
    hookMock.mockReturnValue({
      data: [{ price_usd: 100, date: '2026-01-01' }, { price_usd: 80, date: '2026-02-01' }],
    });
    render(<MarketplacePriceHistory listingId="l1" />);
    expect(screen.getByText(/↓/)).toBeInTheDocument();
    expect(screen.getByText(/-?20\.0%|20\.0%/)).toBeInTheDocument();
  });

  it('shows up arrow for price increase', () => {
    hookMock.mockReturnValue({
      data: [{ price_usd: 50, date: '2026-01-01' }, { price_usd: 75, date: '2026-02-01' }],
    });
    render(<MarketplacePriceHistory listingId="l1" />);
    expect(screen.getByText(/↑/)).toBeInTheDocument();
  });

  it('shows Low + High formatted prices', () => {
    hookMock.mockReturnValue({
      data: [{ price_usd: 10 }, { price_usd: 30 }, { price_usd: 20 }],
    });
    render(<MarketplacePriceHistory listingId="l1" />);
    expect(screen.getByText('Low $10.00')).toBeInTheDocument();
    expect(screen.getByText('High $30.00')).toBeInTheDocument();
  });
});
