/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useAuthMock, buildLinksMock, logClickMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  buildLinksMock: vi.fn(),
  logClickMock: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/useBundledCheckout', () => ({ logTripBookingClick: logClickMock }));
vi.mock('@/lib/booking/placeLinks', () => ({ buildPlaceBookableLinks: buildLinksMock }));

import { PlaceBookableLinks } from '../PlaceBookableLinks';

const baseProps = { tripId: 't1', tripPlaceId: 'tp1', category: 'hotel' as const, name: 'H' };

beforeEach(() => {
  useAuthMock.mockReset();
  buildLinksMock.mockReset();
  logClickMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
});

describe('PlaceBookableLinks', () => {
  it('renders nothing when no links available', () => {
    buildLinksMock.mockReturnValue([]);
    const { container } = render(<PlaceBookableLinks {...baseProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one link per build result, with target=_blank + sponsored rel', () => {
    buildLinksMock.mockReturnValue([
      { provider: 'booking', vertical: 'hotel', url: 'https://booking.com/x', label: 'Booking.com' },
      { provider: 'getyourguide', vertical: 'activity', url: 'https://gyg.com/x', label: 'GetYourGuide' },
    ]);
    render(<PlaceBookableLinks {...baseProps} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    links.forEach(a => {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a.getAttribute('rel')).toContain('sponsored');
    });
  });

  it('fires logTripBookingClick with user id and link metadata when clicked', () => {
    buildLinksMock.mockReturnValue([
      { provider: 'booking', vertical: 'hotel', url: 'https://booking.com/x', label: 'Booking.com' },
    ]);
    render(<PlaceBookableLinks {...baseProps} />);
    fireEvent.click(screen.getByRole('link'));
    expect(logClickMock).toHaveBeenCalledWith({
      trip_id: 't1',
      trip_place_id: 'tp1',
      user_id: 'u1',
      provider: 'booking',
      vertical: 'hotel',
      destination_url: 'https://booking.com/x',
    });
  });

  it('passes user_id=null when signed-out', () => {
    useAuthMock.mockReturnValue({ user: null });
    buildLinksMock.mockReturnValue([
      { provider: 'booking', vertical: 'hotel', url: 'https://booking.com/x', label: 'Booking.com' },
    ]);
    render(<PlaceBookableLinks {...baseProps} />);
    fireEvent.click(screen.getByRole('link'));
    expect(logClickMock).toHaveBeenCalledWith(expect.objectContaining({ user_id: null }));
  });
});
