/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { listMock, useFxMock, computeBalancesMock, suggestSettlementsMock, convertAmountMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  useFxMock: vi.fn(),
  computeBalancesMock: vi.fn(),
  suggestSettlementsMock: vi.fn(),
  convertAmountMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, optsOrDefault?: string | Record<string, unknown>) => {
      if (typeof optsOrDefault === 'string') return optsOrDefault;
      const def = (optsOrDefault as { defaultValue?: string } | undefined)?.defaultValue ?? _k;
      return def;
    },
  }),
}));
vi.mock('@/hooks/usePageFetchers', () => ({ listFromWhere: listMock }));
vi.mock('@/hooks/useFxRates', () => ({ useFxRates: useFxMock }));
vi.mock('@/utils/settleUp', () => ({
  computeBalances: computeBalancesMock,
  suggestSettlements: suggestSettlementsMock,
  convertAmount: convertAmountMock,
}));

import { CostSplitSummary } from '../CostSplitSummary';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const members = [
  { user_id: 'u1', profiles: { display_name: 'Alice', avatar_url: null } },
  { user_id: 'u2', profiles: { display_name: 'Bob', avatar_url: null } },
] as never;

beforeEach(() => {
  listMock.mockReset();
  useFxMock.mockReset();
  computeBalancesMock.mockReset();
  suggestSettlementsMock.mockReset();
  convertAmountMock.mockReset();
  useFxMock.mockReturnValue({ data: new Map() });
  convertAmountMock.mockImplementation((amt: number) => amt);
});

describe('CostSplitSummary', () => {
  it('renders nothing while loading', () => {
    listMock.mockReturnValue(new Promise(() => {}));
    computeBalancesMock.mockReturnValue([]);
    suggestSettlementsMock.mockReturnValue([]);
    const { container } = render(
      <CostSplitSummary tripId="t1" members={members} defaultCurrency="EUR" />,
      { wrapper },
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no balances after load', async () => {
    listMock.mockResolvedValue([]);
    computeBalancesMock.mockReturnValue([]);
    suggestSettlementsMock.mockReturnValue([]);
    const { container } = render(
      <CostSplitSummary tripId="t1" members={members} defaultCurrency="EUR" />,
      { wrapper },
    );
    await new Promise(r => setTimeout(r, 0));
    expect(container.firstChild).toBeNull();
  });

  it('renders balances + suggested transfers when present', async () => {
    listMock.mockResolvedValue([{ paid_by: 'u1', split_among: ['u1', 'u2'], amount: 100, currency: 'EUR' }]);
    computeBalancesMock.mockReturnValue([
      { user_id: 'u1', net: 50 },
      { user_id: 'u2', net: -50 },
    ]);
    suggestSettlementsMock.mockReturnValue([{ from_user_id: 'u2', to_user_id: 'u1', amount: 50 }]);
    render(<CostSplitSummary tripId="t1" members={members} defaultCurrency="EUR" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/Settle up/i)).toBeInTheDocument());
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
    expect(screen.getByText(/Suggested transfers/i)).toBeInTheDocument();
  });

  it('shows skipped-items disclosure when convertAmount returns null', async () => {
    listMock.mockResolvedValue([
      { paid_by: 'u1', split_among: ['u1'], amount: 10, currency: 'XXX' },
    ]);
    convertAmountMock.mockReturnValue(null);
    computeBalancesMock.mockReturnValue([{ user_id: 'u1', net: 0.01 }]);
    suggestSettlementsMock.mockReturnValue([]);
    render(<CostSplitSummary tripId="t1" members={members} defaultCurrency="EUR" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/items in other currencies excluded/i)).toBeInTheDocument());
  });
});
