/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({ addPlace: { mutateAsync: vi.fn(), isPending: false } }),
}));
vi.mock('@/hooks/useTripBookingAssistant', () => ({
  fetchBookingAssistantCities: vi.fn().mockResolvedValue([]),
  fetchTripReservations: vi.fn().mockResolvedValue([]),
  fetchBookingAssistantVenues: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/hooks/useTravelDeals', () => ({ useTravelDeals: () => ({ data: [] }) }));
vi.mock('@/hooks/useHotelSearch', () => ({ useHotelSearch: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useVisitorOrigin', () => ({ useVisitorOrigin: () => ({ originIata: null }) }));
vi.mock('@/components/booking/HotelBookingFlow', () => ({ HotelBookingFlow: () => null }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@/lib/booking/price', () => ({ formatPrice: () => '$0' }));

import { TripBookingAssistant } from '../TripBookingAssistant';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('TripBookingAssistant', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <TripBookingAssistant tripId="t1" places={[]} days={[]} />,
      { wrapper },
    );
    expect(container).toBeTruthy();
  });
});
