/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const toastSpy = vi.fn();
const createTripMutate = vi.fn();
const addPlaceMutate = vi.fn();

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useTrips', () => ({
  useTrips: () => ({ data: [], isLoading: false }),
  useTrip: () => ({ data: null, isLoading: false }),
  useTripMutations: () => ({
    addPlace: {
      mutate: vi.fn(),
      isPending: false,
      mutateAsync: (...args: unknown[]) => addPlaceMutate(...args),
    },
    createTrip: {
      mutate: vi.fn(),
      isPending: false,
      mutateAsync: (...args: unknown[]) => createTripMutate(...args),
    },
  }),
}));
vi.mock('@/hooks/useActiveTrip', () => ({
  useActiveTrip: () => ({ activeTrip: null, setActiveTrip: vi.fn() }),
}));
// No-geo entities trigger an on-demand geo resolve; mock it to "not found" so
// the missing-geo path is exercised deterministically (no real client call).
vi.mock('@/lib/trips/resolveEntityGeo', () => ({
  resolveEntityGeo: vi.fn().mockResolvedValue(new Map()),
}));

import { AddToTripDialog } from '../AddToTripDialog';
import { resolveEntityGeo } from '@/lib/trips/resolveEntityGeo';

function renderDialog(entityOverrides: Record<string, unknown> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const entity = {
    id: 'v1',
    type: 'venue' as const,
    name: 'Thermas Barcelona',
    city_id: 'city-1',
    country_id: 'country-1',
    latitude: 41.4,
    longitude: 2.2,
    address: 'Carrer X',
    category: 'sauna',
    ...entityOverrides,
  };
  return render(
    <QueryClientProvider client={qc}>
      <AddToTripDialog open onClose={vi.fn()} entity={entity} />
    </QueryClientProvider>,
  );
}

describe('AddToTripDialog', () => {
  beforeEach(() => {
    toastSpy.mockReset();
    createTripMutate.mockReset();
    addPlaceMutate.mockReset();
  });

  it('renders closed without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <AddToTripDialog
          open={false}
          onClose={vi.fn()}
          entity={{ id: 'v1', type: 'venue', name: 'X' }}
        />
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });

  it('passes primary_city_id and primary_country_id when creating a new trip', async () => {
    createTripMutate.mockResolvedValue({ id: 'trip-1', title: 'My trip' });
    addPlaceMutate.mockResolvedValue({ id: 'place-1' });

    renderDialog();

    fireEvent.change(screen.getByLabelText(/trip title/i), {
      target: { value: 'Barcelona weekend' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create & add/i }));

    await waitFor(() => expect(createTripMutate).toHaveBeenCalledTimes(1));
    expect(createTripMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Barcelona weekend',
        primary_city_id: 'city-1',
        primary_country_id: 'country-1',
      }),
    );
    await waitFor(() =>
      expect(addPlaceMutate).toHaveBeenCalledWith(
        expect.objectContaining({ trip_id: 'trip-1', venue_id: 'v1' }),
      ),
    );
  });

  it('shows a destructive toast and does not fire mutation when entity has no geo', async () => {
    renderDialog({ city_id: null, country_id: null });

    fireEvent.change(screen.getByLabelText(/trip title/i), {
      target: { value: 'No geo trip' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create & add/i }));

    // Geo resolve is async now, so the destructive toast fires after a tick.
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      ),
    );
    expect(createTripMutate).not.toHaveBeenCalled();
    expect(addPlaceMutate).not.toHaveBeenCalled();
  });

  it('resolves geo on demand for a venue missing city/country, then creates the trip', async () => {
    createTripMutate.mockResolvedValue({ id: 'trip-2', title: 'Resolved' });
    addPlaceMutate.mockResolvedValue({ id: 'place-2' });
    vi.mocked(resolveEntityGeo).mockResolvedValueOnce(
      new Map([
        [
          'v1',
          {
            id: 'v1',
            type: 'venue',
            name: 'Thermas Barcelona',
            city_id: 'c9',
            country_id: 'co9',
            latitude: 1,
            longitude: 2,
            address: 'A',
            category: 'sauna',
          },
        ],
      ]),
    );

    renderDialog({ city_id: null, country_id: null });

    fireEvent.change(screen.getByLabelText(/trip title/i), {
      target: { value: 'Resolved trip' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create & add/i }));

    await waitFor(() =>
      expect(createTripMutate).toHaveBeenCalledWith(
        expect.objectContaining({ primary_city_id: 'c9', primary_country_id: 'co9' }),
      ),
    );
  });
});
