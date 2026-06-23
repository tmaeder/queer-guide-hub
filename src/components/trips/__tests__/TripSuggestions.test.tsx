/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({ addPlacesBulk: { mutateAsync: vi.fn(), isPending: false } }),
}));
vi.mock('@/hooks/useTripSuggestions', () => ({
  fetchTripSuggestionCities: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/searchClient', () => ({
  fetchRecommendations: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/trips/resolveEntityGeo', () => ({
  resolveEntityGeo: vi.fn().mockResolvedValue(new Map()),
  tripPlaceRowFromGeo: vi.fn().mockReturnValue({}),
}));

import { TripSuggestions } from '../TripSuggestions';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('TripSuggestions', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <TripSuggestions tripId="t1" places={[]} days={[]} startDate="2026-06-01" endDate="2026-06-05" />,
      { wrapper },
    );
    expect(container).toBeTruthy();
  });
});
