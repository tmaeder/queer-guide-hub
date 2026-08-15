/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({ event: null as unknown }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));
vi.mock('@/hooks/useTrackEvent', () => ({ useTrackEvent: () => ({ track: vi.fn() }) }));
vi.mock('@/hooks/useTrackView', () => ({ useTrackView: () => {} }));
vi.mock('@/hooks/useEntityTripStatus', () => ({
  useEntityTripStatus: () => ({ data: null, isLoading: false }),
}));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useSlugRedirect', () => ({ useSlugRedirect: () => null }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('@/hooks/usePageFetchers', () => ({ upsertEventAttendance: vi.fn() }));
vi.mock('../EventDetail.parts', async (orig) => {
  const actual = await orig<typeof import('../EventDetail.parts')>();
  return { ...actual, fetchEvent: () => Promise.resolve(state.event) };
});
// maplibre's worker URL is not resolvable under vitest.
vi.mock('@/components/map/EntityMap', () => ({ EntityMap: () => <div data-testid="map" /> }));
vi.mock('@/components/admin/AdminEditButton', () => ({ AdminEditButton: () => null }));
vi.mock('@/components/moderation/ReportButton', () => ({ ReportButton: () => null }));
vi.mock('@/components/marketplace/MarketplaceForEvent', () => ({
  MarketplaceForEvent: () => null,
}));
vi.mock('@/components/events/EventMoreEvents', () => ({ EventMoreEvents: () => null }));
vi.mock('@/components/discovery/MilestonesForEntity', () => ({ MilestonesForEntity: () => null }));

import EventDetail from '../EventDetail';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={['/events/pride-march']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/events/:slug" element={<EventDetail />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('EventDetail', () => {
  it('renders without crashing', () => {
    state.event = null;
    const { container } = renderPage();
    expect(container).toBeTruthy();
  });

  it('renders the gated/not-found fallback rather than an empty shell', async () => {
    state.event = null;
    renderPage();
    expect(await screen.findByText(/Event Not Found/i)).toBeInTheDocument();
  });
});
