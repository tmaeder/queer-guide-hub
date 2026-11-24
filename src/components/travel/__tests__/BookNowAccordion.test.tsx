/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter, useNavigate, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useRecommendations', () => ({
  useRecommendations: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useActivitySearch', () => ({
  useActivitySearch: vi.fn(() => ({ data: [], isLoading: false })),
}));
vi.mock('@/hooks/useHotelSearch', () => ({
  useHotelSearch: vi.fn(() => ({ data: [], isLoading: false })),
}));
vi.mock('@/hooks/useTravelDeals', () => ({
  useTravelDeals: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useVisitorOrigin', () => ({
  useVisitorOrigin: () => ({ originIata: null, originCity: null, loading: false }),
}));
vi.mock('@/hooks/useHotels', () => ({ fetchHotelsPage: vi.fn(async () => ({ hotels: [] })) }));
vi.mock('@/hooks/useTrackEvent', () => ({ useTrackEvent: () => ({ track: vi.fn() }) }));

import { useActivitySearch } from '@/hooks/useActivitySearch';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import { fetchHotelsPage } from '@/hooks/useHotels';
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

function HistoryControls() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
      <output data-testid="location">{location.search}</output>
    </>
  );
}

function renderAt(path: string, tripContext: TripBookingContext | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <HistoryControls />
        <BookNowAccordion defaultOpen={path.includes('intent=book')} tripContext={tripContext} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...view, qc };
}

describe('BookNowAccordion', () => {
  it('shows the three booking tiles closed by default', () => {
    const { getByRole } = renderAt('/travel');
    for (const name of ['Flights', 'Hotels', 'Activities']) {
      expect(getByRole('button', { name: new RegExp(`^${name}\\b`) })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
  });

  it('includes each visible hint in the booking tile accessible name', () => {
    const { getByRole } = renderAt('/travel');
    expect(getByRole('button', { name: /^Flights\b/ })).toHaveAccessibleName(
      'Flights Live fares and deals',
    );
    expect(getByRole('button', { name: /^Hotels\b/ })).toHaveAccessibleName(
      'Hotels Stays with queer-friendly filter',
    );
    expect(getByRole('button', { name: /^Activities\b/ })).toHaveAccessibleName(
      'Activities Tours and tickets by city',
    );
  });

  it('opens the matching search when a tile is clicked', () => {
    const { getByRole } = renderAt('/travel');
    fireEvent.click(getByRole('button', { name: /^Activities\b/ }));
    expect(getByRole('button', { name: /^Activities\b/ })).toHaveAttribute('aria-pressed', 'true');
    expect(getByRole('button', { name: /Search Activities/ })).toBeTruthy();
  });

  it('opens when a ?tab= deep link is present', () => {
    const { getByRole } = renderAt('/travel?tab=hotels');
    expect(getByRole('button', { name: /^Hotels\b/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens when a ?city= deep link is present', () => {
    const { getByRole } = renderAt('/travel?city=Berlin');
    expect(getByRole('button', { name: /^Flights\b/ })).toHaveAttribute('aria-pressed', 'true');
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
  it('falls back to the flight form for an unsupported tab', () => {
    const { getByRole, getByLabelText } = renderAt('/travel/book?tab=invalid');
    expect(getByRole('button', { name: /^Flights\b/ })).toHaveAttribute('aria-pressed', 'true');
    expect(getByLabelText('Departure')).toBeVisible();
  });

  it('restores the selected search with browser Back and Forward', () => {
    const { getByRole } = renderAt('/travel/book?tab=hotels');
    fireEvent.click(getByRole('button', { name: /^Activities\b/ }));
    fireEvent.click(getByRole('button', { name: /^Back$/ }));
    expect(getByRole('button', { name: /^Hotels\b/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(getByRole('button', { name: /^Forward$/ }));
    expect(getByRole('button', { name: /^Activities\b/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('searches activities only on submit, trims the city, and preserves it in the URL', () => {
    const { getByLabelText, getByRole, getByTestId } = renderAt('/travel/book?tab=activities');
    const city = getByLabelText('City');
    vi.mocked(useActivitySearch).mockClear();
    for (const value of ['B', 'Be', 'Ber', 'Berl', 'Berli', ' Berlin ']) {
      fireEvent.change(city, { target: { value } });
    }
    expect(vi.mocked(useActivitySearch).mock.calls.every(([options]) => !options.enabled)).toBe(
      true,
    );
    fireEvent.submit(getByRole('button', { name: 'Search Activities' }).closest('form')!);
    expect(useActivitySearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ city: 'Berlin', enabled: true }),
    );
    expect(getByTestId('location')).toHaveTextContent('city=Berlin');
    expect(getByLabelText('City')).toHaveValue('Berlin');
    fireEvent.click(getByRole('button', { name: /^Back$/ }));
    expect(getByLabelText('City')).toHaveValue('');
    expect(useActivitySearch).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('restores submitted hotel searches and form values on Back', () => {
    const { getByRole, getByLabelText } = renderAt('/travel/book?tab=hotels&city=Berlin');
    fireEvent.change(getByLabelText('Where'), { target: { value: 'Lisbon' } });
    fireEvent.click(getByRole('button', { name: 'Search stays' }));
    expect(useHotelSearch).toHaveBeenLastCalledWith(expect.objectContaining({ city: 'Lisbon' }));
    fireEvent.click(getByRole('button', { name: /^Back$/ }));
    expect(getByLabelText('Where')).toHaveValue('Berlin');
    expect(useHotelSearch).toHaveBeenLastCalledWith(expect.objectContaining({ city: 'Berlin' }));
  });

  it('does not refetch own stays while the hotels section is closed', async () => {
    vi.mocked(fetchHotelsPage).mockClear();
    const { getByRole, qc } = renderAt('/travel/book?tab=hotels&city=Berlin');
    await waitFor(() => expect(fetchHotelsPage).toHaveBeenCalledTimes(1));
    fireEvent.click(getByRole('button', { name: /^Hotels\b/ }));
    vi.mocked(fetchHotelsPage).mockClear();
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ['book-own-stays'] });
    });
    expect(fetchHotelsPage).not.toHaveBeenCalled();
  });
});
