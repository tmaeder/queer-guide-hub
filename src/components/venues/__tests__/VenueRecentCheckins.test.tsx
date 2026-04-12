import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { mockGetVenueCheckins } = vi.hoisted(() => ({
  mockGetVenueCheckins: vi.fn(),
}));

vi.mock('@/hooks/useVenueCheckins', () => ({
  useVenueCheckins: () => ({ getVenueCheckins: mockGetVenueCheckins }),
}));

import { VenueRecentCheckins } from '../VenueRecentCheckins';

describe('VenueRecentCheckins', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should show loading skeleton initially', () => {
    mockGetVenueCheckins.mockReturnValue(new Promise(() => {})); // never resolves
    render(<VenueRecentCheckins venueId="v-1" />);
    expect(screen.getByText('Venue Activity')).toBeInTheDocument();
  });

  it('should show empty state when no checkins', async () => {
    mockGetVenueCheckins.mockResolvedValue([]);
    render(<VenueRecentCheckins venueId="v-1" />);
    await waitFor(() => expect(screen.getByText('No recent activity')).toBeInTheDocument());
  });

  it('should show total visits', async () => {
    mockGetVenueCheckins.mockResolvedValue([
      { checkin_hour: '2024-06-15T14:00:00Z', total_checkins: 5 },
      { checkin_hour: '2024-06-15T16:00:00Z', total_checkins: 3 },
    ]);
    render(<VenueRecentCheckins venueId="v-1" />);
    await waitFor(() => expect(screen.getByText('8')).toBeInTheDocument());
    expect(screen.getByText(/total visits/i)).toBeInTheDocument();
  });

  it('should call getVenueCheckins with venue id', async () => {
    mockGetVenueCheckins.mockResolvedValue([]);
    render(<VenueRecentCheckins venueId="v-123" />);
    await waitFor(() => expect(mockGetVenueCheckins).toHaveBeenCalledWith('v-123'));
  });
});
