/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({ addPlace: { mutateAsync: vi.fn(), isPending: false } }),
}));
vi.mock('@/hooks/useTripBookingAssistant', () => ({
  fetchBookingAssistantCities: vi.fn().mockResolvedValue([]),
  fetchBookingAssistantVenues: vi.fn().mockResolvedValue([]),
}));
const { useTripReservations, save, update, useHotelSearch, useActivitySearch } = vi.hoisted(() => ({
  useTripReservations: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  useHotelSearch: vi.fn(),
  useActivitySearch: vi.fn(),
}));
vi.mock('@/hooks/useTripReservations', () => ({
  useTripReservations,
  useReservationMutations: () => ({
    addReservation: { mutateAsync: save, isPending: false },
    updateReservation: { mutateAsync: update, isPending: false },
  }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'traveler' } }) }));
vi.mock('@/hooks/useVisitorOrigin', () => ({ useVisitorOrigin: () => ({ originIata: 'LHR' }) }));
vi.mock('@/hooks/useAirportSearch', () => ({
  fetchAirportByIata: vi.fn().mockResolvedValue(null),
  searchAirports: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/hooks/useActivitySearch', () => ({ useActivitySearch }));
vi.mock('@/hooks/useHotelSearch', () => ({ useHotelSearch }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import { TripBookingAssistant } from '../TripBookingAssistant';
import { fetchBookingAssistantCities } from '@/hooks/useTripBookingAssistant';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const offer = {
  id: 'offer-1',
  vertical: 'hotel',
  title: 'Rainbow Hotel',
  provider: 'partner',
  price: 125,
  currency: 'CHF',
  bookingUrl: 'https://partner.example/hotel',
};

const city = { id: 'zurich', name: 'Zurich', country_id: 'ch', major_airport_code: 'ZRH' };

describe('TripBookingAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTripReservations.mockReturnValue({ data: [], isSuccess: true });
    useHotelSearch.mockReturnValue({ data: [], isLoading: false });
    useActivitySearch.mockReturnValue({ data: [], isLoading: false });
    save.mockResolvedValue({ id: 'reservation-1' });
    vi.mocked(fetchBookingAssistantCities).mockResolvedValue([city]);
  });

  it('uses the primary destination before any stops and saves a pending hotel before checkout', async () => {
    useHotelSearch.mockReturnValue({ data: [offer], isLoading: false });

    render(
      <TripBookingAssistant
        tripId="t1"
        places={[]}
        canEdit
        primaryCityId="zurich"
        startDate="2027-03-15"
        endDate="2027-03-18"
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    fireEvent.click(await screen.findByRole('button', { name: /Rainbow Hotel/ }));
    expect(screen.queryByRole('link', { name: 'Continue on partner site' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save as pending' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          trip_id: 't1',
          status: 'pending',
          source: 'provider_api',
          booking_url: offer.bookingUrl,
        }),
      ),
    );
    expect(useHotelSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        city: 'Zurich',
        checkIn: '2027-03-15',
        checkOut: '2027-03-18',
        enabled: true,
      }),
    );
  });

  it('resumes pending checkout and confirms the same reservation', async () => {
    useHotelSearch.mockReturnValue({ data: [], isLoading: false });
    useTripReservations.mockReturnValue({
      data: [
        {
          id: 'reservation-1',
          user_id: 'traveler',
          type: 'hotel',
          title: offer.title,
          status: 'pending',
          booking_url: offer.bookingUrl,
        },
      ],
    });
    render(<TripBookingAssistant tripId="t1" places={[]} canEdit />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    expect(screen.getByRole('link', { name: 'Continue on partner site' })).toHaveAttribute(
      'href',
      offer.bookingUrl,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record confirmation' }));
    expect(screen.getByRole('dialog', { name: 'Edit Reservation' })).toBeVisible();
    expect(screen.getByLabelText('Title')).toHaveValue(offer.title);
    fireEvent.change(screen.getByLabelText('Confirmation Code'), { target: { value: 'TEST123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'reservation-1',
          status: 'confirmed',
          confirmation_code: 'TEST123',
        }),
      ),
    );
  });
  it('tracks a partner flight search with the trip dates and without a guessed fare', async () => {
    const nextYear = new Date().getUTCFullYear() + 1;
    render(
      <TripBookingAssistant
        tripId="t1"
        places={[]}
        canEdit
        primaryCityId={city.id}
        startDate={`${nextYear}-03-15`}
        endDate={`${nextYear}-03-18`}
      />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    fireEvent.click(screen.getByRole('button', { name: 'Flights' }));
    await waitFor(() => expect(screen.getByLabelText('Arrival airport')).toHaveValue('ZRH'));
    fireEvent.click(screen.getByRole('button', { name: 'Review flight search' }));
    expect(screen.getByRole('dialog', { name: 'LHR → ZRH' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save as pending' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          trip_id: 't1',
          type: 'flight',
          amount: null,
          status: 'pending',
          booking_url: expect.stringContaining('params=LHR1503ZRH18031'),
        }),
      ),
    );
  });

  it('searches and tracks partner activities in the trip destination', async () => {
    const activity = { ...offer, vertical: 'activity', title: 'Old town walk' };
    useActivitySearch.mockReturnValue({ data: [activity], isLoading: false });
    render(<TripBookingAssistant tripId="t1" places={[]} canEdit primaryCityId={city.id} />, {
      wrapper,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    fireEvent.click(screen.getByRole('button', { name: 'Activities' }));
    await waitFor(() =>
      expect(useActivitySearch).toHaveBeenLastCalledWith(
        expect.objectContaining({
          city: 'Zurich',
          enabled: true,
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /Old town walk/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as pending' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          trip_id: 't1',
          type: 'activity',
          status: 'pending',
          booking_url: activity.bookingUrl,
        }),
      ),
    );
  });
});
