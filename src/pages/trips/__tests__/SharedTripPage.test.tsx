/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
    expect(await screen.findByText(/not available|notFoundTitle/i)).toBeTruthy();
  });

  it('states the share is view-only and which sections it includes', async () => {
    rpc.mockResolvedValue({ data: VIEW, error: null });
    renderPage();
    expect(await screen.findByText('View only. This link shows: itinerary')).toBeTruthy();
  });

  it('offers day navigation before the itinerary when there are several days', async () => {
    rpc.mockResolvedValue({
      data: {
        ...VIEW,
        days: [
          ...VIEW.days,
          { id: 'd2', date: '2026-11-07', title: null, notes: null, sort_order: 1 },
        ],
      },
      error: null,
    });
    renderPage();
    const nav = await screen.findByRole('navigation', { name: 'Days' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['#shared-day-d1', '#shared-day-d2']);
    expect(document.getElementById('shared-day-d2')).toBeTruthy();
  });

  it('opens a budget-only share on the budget, without an empty itinerary tab', async () => {
    rpc.mockResolvedValue({
      data: {
        trip: VIEW.trip,
        permissions: { itinerary: false, budget: true, notes: false, packing: false },
        budget_items: [
          { title: 'Hotel', amount: 200, currency: 'EUR', category: null, date: null },
        ],
      },
      error: null,
    });
    renderPage();
    expect(await screen.findByText('Hotel')).toBeTruthy();
    expect(screen.queryByText('trips.shared.tabs.itinerary')).toBeNull();
  });

  it('gives an unavailable link a way forward', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    renderPage();
    const plan = await screen.findByRole('link', { name: 'Plan your own trip' });
    expect(plan.getAttribute('href')).toBe('/travel');
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });
});
