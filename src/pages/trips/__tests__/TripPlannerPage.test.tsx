/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useTrips', () => ({ useTrip: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/useTripReservations', () => ({ useTripReservations: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import TripPlannerPage from '../TripPlannerPage';

describe('TripPlannerPage', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/trips/t1/plan']}>
        <Routes><Route path="/trips/:tripId/plan" element={<TripPlannerPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
