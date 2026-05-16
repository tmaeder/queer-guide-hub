/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useTripBookingClicksMock } = vi.hoisted(() => ({ useTripBookingClicksMock: vi.fn() }));

vi.mock('@/hooks/useTripBookingClicks', () => ({ useTripBookingClicks: useTripBookingClicksMock }));

import { BookingActivitySection } from '../BookingActivitySection';

beforeEach(() => useTripBookingClicksMock.mockReset());

describe('BookingActivitySection', () => {
  it('renders nothing while loading', () => {
    useTripBookingClicksMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<BookingActivitySection tripId="t1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when total clicks = 0', () => {
    useTripBookingClicksMock.mockReturnValue({
      data: { total: 0, byVertical: {}, recent: [] },
      isLoading: false,
    });
    const { container } = render(<BookingActivitySection tripId="t1" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows total + per-vertical counts (sorted desc)', () => {
    useTripBookingClicksMock.mockReturnValue({
      data: {
        total: 5,
        byVertical: { hotel: 3, activity: 2, flight: 0, restaurant: 0, other: 0 },
        recent: [],
      },
      isLoading: false,
    });
    render(<BookingActivitySection tripId="t1" />);
    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText('Hotels')).toBeInTheDocument();
    expect(screen.getByText('Activities')).toBeInTheDocument();
    expect(screen.queryByText('Flights')).toBeNull();
  });

  it('renders recent clicks with host extracted from URL', () => {
    useTripBookingClicksMock.mockReturnValue({
      data: {
        total: 1,
        byVertical: { hotel: 1, activity: 0, flight: 0, restaurant: 0, other: 0 },
        recent: [
          {
            id: 'c1',
            provider: 'Booking',
            vertical: 'hotel',
            destination_url: 'https://booking.com/hotel/123',
            clicked_at: new Date(Date.now() - 60_000).toISOString(),
          },
        ],
      },
      isLoading: false,
    });
    render(<BookingActivitySection tripId="t1" />);
    expect(screen.getByText('booking.com')).toBeInTheDocument();
    expect(screen.getByText('Booking')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open link/i })).toHaveAttribute('href', 'https://booking.com/hotel/123');
  });
});
