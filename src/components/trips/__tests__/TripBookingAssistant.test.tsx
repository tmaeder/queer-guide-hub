/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
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
const { useTripReservations, save, update, useHotelSearch } = vi.hoisted(() => ({
  useTripReservations: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  useHotelSearch: vi.fn(),
}));
vi.mock('@/hooks/useTripReservations', () => ({
  useTripReservations,
  useReservationMutations: () => ({
    addReservation: { mutateAsync: save, isPending: false },
    updateReservation: { mutateAsync: update, isPending: false },
  }),
}));
vi.mock('@/hooks/useHotelSearch', () => ({ useHotelSearch }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('@/lib/booking/price', () => ({ formatPrice: () => '$0' }));

import { TripBookingAssistant } from '../TripBookingAssistant';
import { fetchBookingAssistantCities } from '@/hooks/useTripBookingAssistant';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const offer = {
  id: 'offer-1',
  title: 'Rainbow Hotel',
  provider: 'partner',
  price: 125,
  currency: 'CHF',
  bookingUrl: 'https://partner.example/hotel',
};

describe('TripBookingAssistant', () => {
  it('uses the primary destination before any stops and saves a pending hotel before checkout', async () => {
    useTripReservations.mockReturnValue({ data: [] });
    useHotelSearch.mockReturnValue({ data: [offer], isLoading: false });
    save.mockResolvedValue({ id: 'reservation-1' });
    vi.mocked(fetchBookingAssistantCities).mockResolvedValue([
      { id: 'zurich', name: 'Zurich', country_id: 'ch' },
    ]);

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
});
