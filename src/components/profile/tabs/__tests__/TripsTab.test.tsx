/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useTrips', () => ({
  useTrips: () => ({ data: [], isLoading: false }),
  useTripMutations: () => ({ createTrip: vi.fn(), updateTrip: vi.fn(), deleteTrip: vi.fn() }),
}));
vi.mock('@/hooks/useTripSaves', () => ({ useMyTripSaves: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { TripsTab } from '../TripsTab';

describe('TripsTab', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <TripsTab />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
