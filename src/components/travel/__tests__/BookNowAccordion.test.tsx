/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useRecommendations', () => ({ useRecommendations: () => ({ data: [], isLoading: false }) }));

import { fireEvent } from '@testing-library/react';
import { BookNowAccordion } from '../BookNowAccordion';
import type { TripBookingContext } from '@/hooks/useTripBookingContext';

const TRIP_CTX: TripBookingContext = {
  tripId: 't1',
  tripTitle: 'Berlin trip',
  cityName: 'Berlin',
  checkIn: '2026-08-12',
  checkOut: '2026-08-16',
  destinationIata: 'BER',
  destinationLabel: 'Berlin',
};

function renderAt(path: string, tripContext: TripBookingContext | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <BookNowAccordion defaultOpen={path.includes('intent=book')} tripContext={tripContext} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('BookNowAccordion', () => {
  it('renders closed by default (no booking tabs visible)', () => {
    const { queryByRole } = renderAt('/travel');
    expect(queryByRole('button', { name: 'Flights' })).toBeNull();
  });

  it('opens when a ?tab= deep link is present', () => {
    const { getByRole } = renderAt('/travel?tab=hotels');
    expect(getByRole('button', { name: 'Hotels' })).toBeTruthy();
  });

  it('opens when a ?city= deep link is present', () => {
    const { getByRole } = renderAt('/travel?city=Berlin');
    expect(getByRole('button', { name: 'Flights' })).toBeTruthy();
  });

  it('shows the trip-context banner when the trip seeds the search', () => {
    const { getByTestId } = renderAt('/travel?intent=book', TRIP_CTX);
    const banner = getByTestId('trip-context-banner');
    // The global i18n test stub returns defaults without interpolation, so
    // assert the copy + the date range rather than the city name.
    expect(banner.textContent).toContain('Searching for your');
    expect(banner.textContent).toContain('12–16');
  });

  it('URL params beat trip context (no banner)', () => {
    const { queryByTestId } = renderAt('/travel?tab=hotels&city=Madrid', TRIP_CTX);
    expect(queryByTestId('trip-context-banner')).toBeNull();
  });

  it('the change button drops the trip seed', () => {
    const { getByTestId, queryByTestId, getByRole } = renderAt('/travel?intent=book', TRIP_CTX);
    fireEvent.click(getByRole('button', { name: 'change' }));
    expect(queryByTestId('trip-context-banner')).toBeNull();
    expect(getByTestId('book-now-section')).toBeTruthy();
  });
});
