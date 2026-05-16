/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const EMPTY: never[] = [];

vi.mock('@/hooks/useTrips', () => ({
  useTrip: () => ({
    data: {
      id: 't1', title: 'X', trip_days: EMPTY, trip_places: EMPTY,
      start_date: '2026-05-15', end_date: '2026-05-20',
    },
    isLoading: false, error: null,
  }),
}));
vi.mock('@/hooks/useReservations', () => ({ useReservations: () => ({ data: EMPTY, isLoading: false }) }));
vi.mock('@/hooks/useTripSafety', () => ({ useTripSafety: () => ({ countries: EMPTY, isLoading: false }) }));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));
vi.mock('@/hooks/usePushSubscription', () => ({ usePushSubscription: () => ({ subscribed: false, subscribe: vi.fn(), unsubscribe: vi.fn() }) }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/utils/tripSegments', () => ({ computeTripSegments: () => [], findActiveSegment: () => null }));

import TodayModePage from '../TodayModePage';

describe('TodayModePage', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/trips/t1/today']}>
        <Routes><Route path="/trips/:tripId/today" element={<TodayModePage />} /></Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
