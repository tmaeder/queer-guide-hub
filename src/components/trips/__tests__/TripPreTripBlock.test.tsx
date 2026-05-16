/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useTripReservations', () => ({
  useTripReservations: () => ({ data: [], isLoading: false }),
  useReservationMutations: () => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), isPending: false }),
}));
vi.mock('../AddReservationDialog', () => ({ AddReservationDialog: () => null }));

import { TripPreTripBlock } from '../TripPreTripBlock';

const trip = { id: 't1', title: 'X', start_date: '2026-06-01', end_date: '2026-06-05', trip_days: [], trip_places: [] } as never;

describe('TripPreTripBlock', () => {
  it('renders without crashing', () => {
    const { container } = render(<TripPreTripBlock trip={trip} />);
    expect(container).toBeTruthy();
  });
});
