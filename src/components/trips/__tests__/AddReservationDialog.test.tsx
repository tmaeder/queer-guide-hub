/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useToastMock, useReservationMutationsMock, addMutate, updateMutate } = vi.hoisted(() => ({
  useToastMock: vi.fn(),
  useReservationMutationsMock: vi.fn(),
  addMutate: vi.fn(),
  updateMutate: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));
vi.mock('@/hooks/useTripReservations', () => ({ useReservationMutations: useReservationMutationsMock }));

import { AddReservationDialog } from '../AddReservationDialog';

beforeEach(() => {
  useToastMock.mockReset();
  useReservationMutationsMock.mockReset();
  addMutate.mockReset();
  updateMutate.mockReset();
  useToastMock.mockReturnValue({ toast: vi.fn() });
  useReservationMutationsMock.mockReturnValue({
    addReservation: { mutate: addMutate, isPending: false },
    updateReservation: { mutate: updateMutate, isPending: false },
  });
});

describe('AddReservationDialog', () => {
  it('renders nothing when closed', () => {
    render(<AddReservationDialog open={false} onClose={vi.fn()} tripId="t1" />);
    expect(screen.queryByLabelText(/Title/i)).toBeNull();
  });

  it('renders form fields when open', () => {
    render(<AddReservationDialog open onClose={vi.fn()} tripId="t1" />);
    expect(screen.getAllByText(/Title/i).length).toBeGreaterThan(0);
  });

  it('pre-fills fields when editing existing', () => {
    render(
      <AddReservationDialog
        open
        onClose={vi.fn()}
        tripId="t1"
        existing={{ id: 'r1', type: 'hotel', title: 'Hyatt', currency: 'USD', amount: 200, status: 'confirmed' } as never}
      />,
    );
    expect((screen.getByDisplayValue('Hyatt'))).toBeInTheDocument();
  });
});
