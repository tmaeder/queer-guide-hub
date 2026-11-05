/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const EMPTY: never[] = [];
const { useOnlineStatus, useTrip, readTripSnapshot } = vi.hoisted(() => ({
  useOnlineStatus: vi.fn(),
  useTrip: vi.fn(),
  readTripSnapshot: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'alice' } }) }));
vi.mock('@/hooks/useTrips', () => ({ useTrip }));
vi.mock('@/utils/offlineTripPack', () => ({ readTripSnapshot }));
vi.mock('@/hooks/useReservations', () => ({
  useReservations: () => ({ data: EMPTY, isLoading: false }),
}));
vi.mock('@/hooks/useTripSafety', () => ({
  useTripSafety: () => ({ countries: EMPTY, isLoading: false }),
}));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus }));
vi.mock('@/hooks/usePushSubscription', () => ({
  usePushSubscription: () => ({ subscribed: false, subscribe: vi.fn(), unsubscribe: vi.fn() }),
}));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/utils/tripSegments', () => ({
  computeTripSegments: () => [],
  findActiveSegment: () => null,
}));

import TodayModePage from '../TodayModePage';

const TRIP_ID = '12df4310-41de-4ac9-8d5a-ed7c08ff35f9';

function renderToday() {
  return render(
    <MemoryRouter initialEntries={[`/trips/${TRIP_ID}/today`]}>
      <Routes>
        <Route path="/trips/:tripId/today" element={<TodayModePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TodayModePage', () => {
  it('renders without crashing', () => {
    useOnlineStatus.mockReturnValue(true);
    useTrip.mockReturnValue({
      data: {
        id: TRIP_ID,
        title: 'X',
        trip_days: EMPTY,
        trip_places: EMPTY,
        start_date: '2026-05-15',
        end_date: '2026-05-20',
      },
      isLoading: false,
      error: null,
    });
    expect(renderToday().container).toBeTruthy();
  });

  it('shows the offline message after a cache miss while the live request is still pending', async () => {
    useOnlineStatus.mockReturnValue(false);
    useTrip.mockReturnValue({ isLoading: true });
    readTripSnapshot.mockResolvedValue(null);

    renderToday();

    expect(await screen.findByRole('heading', { name: 'No offline copy available' })).toBeVisible();
    expect(readTripSnapshot).toHaveBeenCalledWith('alice', TRIP_ID);
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  });
});
