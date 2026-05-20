/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useTripReservations', () => ({
  useTripReservations: () => ({ data: [], isLoading: false }),
  useReservationMutations: () => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), isPending: false }),
}));
vi.mock('../AddReservationDialog', () => ({ AddReservationDialog: () => null }));
vi.mock('../TripBookingInbox', () => ({ TripBookingInbox: () => null }));

import { TripPreTripBlock } from '../TripPreTripBlock';

const trip = { id: 't1', title: 'X', start_date: '2026-06-01', end_date: '2026-06-05', trip_days: [], trip_places: [] } as never;

describe('TripPreTripBlock', () => {
  it('renders without crashing', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TripPreTripBlock trip={trip} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });
});
