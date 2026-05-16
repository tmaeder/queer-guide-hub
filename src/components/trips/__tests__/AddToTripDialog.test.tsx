/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useTrips', () => ({
  useTrips: () => ({ trips: [], loading: false }),
  useTrip: () => ({ data: null, isLoading: false }),
  useTripMutations: () => ({
    addPlace: { mutate: vi.fn(), isPending: false, mutateAsync: vi.fn().mockResolvedValue(null) },
    createTrip: { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(null) },
  }),
}));
vi.mock('@/hooks/useActiveTrip', () => ({ useActiveTrip: () => ({ trip: null, setTrip: vi.fn() }) }));

import { AddToTripDialog } from '../AddToTripDialog';

describe('AddToTripDialog', () => {
  it('renders closed without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <AddToTripDialog open={false} onClose={vi.fn()} entity={{ id: 'v1', type: 'venue', name: 'X' } as never} />
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });
});
