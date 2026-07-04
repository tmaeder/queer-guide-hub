/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useTrips', () => ({
  useTrip: () => ({ data: null, isLoading: false }),
  canEditTrip: () => false,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useTripReservations', () => ({ useTripReservations: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import TripPlannerPage from '../TripPlannerPage';

describe('TripPlannerPage', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/trips/t1/plan']}>
          <Routes><Route path="/trips/:tripId/plan" element={<TripPlannerPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });
});
