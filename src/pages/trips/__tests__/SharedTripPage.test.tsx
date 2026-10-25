/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: (...args: unknown[]) => rpc(...args),
}));
vi.mock('@/hooks/useTripReactions', () => ({ useTripReactions: () => ({ data: undefined }) }));
vi.mock('@/hooks/useTripComments', () => ({ useTripComments: () => ({ data: undefined }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/components/trips/TripMapLazy', () => ({ TripMap: () => null }));
vi.mock('@/components/trips/PlaceReactionBar', () => ({ PlaceReactionBar: () => null }));
vi.mock('@/components/trips/PlaceCommentThread', () => ({ PlaceCommentThread: () => null }));
vi.mock('@/components/auth/AuthDialog', () => ({ AuthDialog: () => null }));

import SharedTripPage from '../SharedTripPage';

// The shape get_shared_trip_view returns for a share with itinerary only.
const VIEW = {
  trip: {
    id: 't1',
    title: 'Berlin long weekend',
    description: null,
    start_date: '2026-11-06',
    end_date: '2026-11-08',
    currency: 'EUR',
    cover_image_url: null,
  },
  permissions: { itinerary: true, budget: false, notes: false, packing: false },
  days: [{ id: 'd1', date: '2026-11-06', title: null, notes: null, sort_order: 0 }],
  places: [
    {
      id: 'p1',
      day_id: 'd1',
      custom_name: null,
      custom_address: null,
      latitude: null,
      longitude: null,
      category: 'bar',
      sort_order: 0,
      start_time: null,
      end_time: null,
      venue_name: 'SchwuZ',
      event_title: null,
      hotel_name: null,
      country_name: 'Germany',
      country_code: 'DE',
      equality_score: 90,
    },
  ],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={['/trips/shared/tok123']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/trips/shared/:token" element={<SharedTripPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('SharedTripPage', () => {
  beforeEach(() => rpc.mockReset());

  it('renders the trip from get_shared_trip_view', async () => {
    rpc.mockResolvedValue({ data: VIEW, error: null });
    renderPage();
    expect(await screen.findByText('Berlin long weekend')).toBeTruthy();
    expect(screen.getByText('SchwuZ')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('get_shared_trip_view', { p_token: 'tok123' });
    // Budget was not granted, so no budget tab.
    expect(screen.queryByText('trips.shared.tabs.budget')).toBeNull();
    const og = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
    expect(og?.content).toContain('trip-og-image?token=tok123');
  });

  it('shows not-found for an unknown or expired token (RPC returns null)', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    renderPage();
    expect(await screen.findByText(/notFoundTitle|not found/i)).toBeTruthy();
  });
});
