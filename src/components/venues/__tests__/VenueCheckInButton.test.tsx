/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useVenueCheckins', () => ({
  useVenueCheckins: () => ({ checkInAtVenue: vi.fn(), loading: false, _MAX_CHECKIN_DISTANCE_METERS: 100 }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import { VenueCheckInButton } from '../VenueCheckInButton';

describe('VenueCheckInButton', () => {
  it('renders without crashing', () => {
    const { container } = render(<VenueCheckInButton venueId="v1" venueName="Bar" />);
    expect(container).toBeTruthy();
  });
});
