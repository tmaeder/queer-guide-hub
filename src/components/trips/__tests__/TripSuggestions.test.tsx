/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useTrips', () => ({
  useTripMutations: () => ({ addPlace: { mutateAsync: vi.fn(), isPending: false } }),
}));
vi.mock('@/hooks/useTripSuggestions', () => ({
  fetchTripSuggestionCities: vi.fn().mockResolvedValue([]),
  fetchTripSuggestionVenues: vi.fn().mockResolvedValue([]),
  fetchTripSuggestionEvents: vi.fn().mockResolvedValue([]),
}));

import { TripSuggestions } from '../TripSuggestions';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {});

describe('TripSuggestions', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <TripSuggestions tripId="t1" places={[]} days={[]} startDate="2026-06-01" endDate="2026-06-05" />,
      { wrapper },
    );
    expect(container).toBeTruthy();
  });
});
