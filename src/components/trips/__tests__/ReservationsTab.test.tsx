/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../AddReservationDialog', () => ({ AddReservationDialog: () => null }));
vi.mock('@/hooks/useTripReservations', () => ({
  useTripReservations: () => ({ data: [], isLoading: false }),
  useReservationMutations: () => ({
    createReservation: { mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) },
    updateReservation: { mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) },
    deleteReservation: { mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) },
  }),
}));

import { ReservationsTab } from '../ReservationsTab';

describe('ReservationsTab', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<QueryClientProvider client={qc}><ReservationsTab tripId="t1" /></QueryClientProvider>);
    expect(container).toBeTruthy();
  });
});
