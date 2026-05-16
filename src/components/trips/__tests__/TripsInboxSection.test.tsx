/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useTrips', () => ({
  useTrips: () => ({ trips: [], loading: false }),
  useTripMutations: () => ({ createTrip: vi.fn(), updateTrip: vi.fn(), deleteTrip: vi.fn() }),
}));
vi.mock('@/hooks/useReservations', () => ({
  useReservations: () => ({ data: [], isLoading: false }),
  useAttachBookingToTrip: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useEmailForwardingAddress', () => ({ useEmailForwardingAddress: () => ({ data: 'inbox@example.com', isLoading: false }) }));

import { TripsInboxSection } from '../TripsInboxSection';

describe('TripsInboxSection', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><TripsInboxSection /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
