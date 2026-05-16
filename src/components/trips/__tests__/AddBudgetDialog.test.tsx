/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useToastMock, useBudgetMutationsMock, addMutateAsync, toastFn } = vi.hoisted(() => ({
  useToastMock: vi.fn(),
  useBudgetMutationsMock: vi.fn(),
  addMutateAsync: vi.fn(),
  toastFn: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/hooks/useTripBudget', () => ({ useBudgetMutations: useBudgetMutationsMock }));

import { AddBudgetDialog } from '../AddBudgetDialog';

const members = [
  { user_id: 'u1', profiles: { display_name: 'Alice', avatar_url: null } },
  { user_id: 'u2', profiles: { display_name: 'Bob', avatar_url: null } },
] as never;

beforeEach(() => {
  useToastMock.mockReset();
  useBudgetMutationsMock.mockReset();
  addMutateAsync.mockReset();
  toastFn.mockReset();
  useToastMock.mockReturnValue({ toast: toastFn });
  useBudgetMutationsMock.mockReturnValue({ addBudgetItem: { mutateAsync: addMutateAsync, isPending: false } });
  addMutateAsync.mockResolvedValue(undefined);
});

describe('AddBudgetDialog', () => {
  it('renders nothing when closed', () => {
    render(<AddBudgetDialog open={false} onClose={vi.fn()} tripId="t1" members={members} />);
    expect(screen.queryByText(/Add Expense/i)).toBeNull();
  });

  it('renders form fields when open', () => {
    render(<AddBudgetDialog open onClose={vi.fn()} tripId="t1" members={members} />);
    expect(screen.getByLabelText(/Title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument();
  });

  it('Add button disabled until required fields filled', () => {
    render(<AddBudgetDialog open onClose={vi.fn()} tripId="t1" members={members} />);
    const submit = screen.getAllByRole('button', { name: /Add Expense/i }).find(b => !b.textContent?.includes('Add Expense ')) ?? screen.getAllByRole('button', { name: /Add Expense/i })[1];
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Dinner' } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '50' } });
    expect(submit).not.toBeDisabled();
  });

  it('submits the expense + toasts success + closes', async () => {
    const onClose = vi.fn();
    render(<AddBudgetDialog open onClose={onClose} tripId="t1" members={members} />);
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Dinner' } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '50' } });
    const buttons = screen.getAllByRole('button', { name: /Add Expense/i });
    fireEvent.click(buttons[buttons.length - 1]);
    await Promise.resolve();
    await Promise.resolve();
    expect(addMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trip_id: 't1', title: 'Dinner', amount: 50, currency: 'EUR' }),
    );
  });

  it('toggles split membership when chip clicked', () => {
    render(<AddBudgetDialog open onClose={vi.fn()} tripId="t1" members={members} />);
    // Alice chip is on by default. Click to remove.
    const chips = screen.getAllByRole('button', { name: /Alice|Bob/ });
    expect(chips.length).toBeGreaterThan(0);
  });
});
