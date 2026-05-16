/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../AddBudgetDialog', () => ({ AddBudgetDialog: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useTripBudget', () => ({
  useTripBudget: () => ({
    items: [],
    summary: { totalByCategory: {}, totalByPerson: {}, total: 0 },
    isLoading: false,
  }),
  useBudgetMutations: () => ({
    createBudgetItem: { mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) },
    updateBudgetItem: { mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) },
    deleteBudgetItem: { mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) },
  }),
}));

import { BudgetTab } from '../BudgetTab';

describe('BudgetTab', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <BudgetTab tripId="t1" members={[]} defaultCurrency="USD" />
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });
});
