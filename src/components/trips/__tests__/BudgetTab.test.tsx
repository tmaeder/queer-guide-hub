/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useTripBudget', () => ({
  useTripBudget: () => ({
    items: [],
    summary: { totalByCategory: {}, totalByPerson: {}, total: 0 },
    isLoading: false,
  }),
  useBudgetMutations: () => ({
    create: { mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) },
    update: { mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) },
    remove: { mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) },
  }),
}));

import { BudgetTab } from '../BudgetTab';

describe('BudgetTab', () => {
  it('renders without crashing', () => {
    const { container } = render(<BudgetTab tripId="t1" members={[]} defaultCurrency="USD" />);
    expect(container).toBeTruthy();
  });
});
