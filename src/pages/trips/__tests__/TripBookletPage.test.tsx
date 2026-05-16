/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@/hooks/useTrips', () => ({ useTrip: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/useTripReservations', () => ({ useTripReservations: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));

import TripBookletPage from '../TripBookletPage';

describe('TripBookletPage', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/trips/t1/booklet']}>
        <Routes><Route path="/trips/:tripId/booklet" element={<TripBookletPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
