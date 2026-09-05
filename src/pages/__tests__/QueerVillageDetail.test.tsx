/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const village = vi.hoisted(() => ({ data: null as unknown }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));
// See the matching note in EventDetail.test.tsx. `GatedDetailFallback` asks
// `gated_entity_exists` before choosing between the sign-in gate and the
// not-found stop, and `useAuth` above makes every case here signed-out, which
// is precisely when that query runs. Unmocked, this "unit" test issues a live
// request to the production database and its result depends on prod latency —
// it failed on 2026-09-05 for that reason alone, with no code change.
//
// `data: false` = nothing is gated, so the not-found branch below is reached.
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: () => Promise.resolve({ data: false, error: null }),
}));
vi.mock('@/hooks/useFavorites', () => ({
  useFavorites: () => ({ toggleFavorite: vi.fn(), isFavorited: () => false }),
}));
vi.mock('@/hooks/useVenues', () => ({
  useVenues: () => ({ venues: [], loading: false, fetchVenues: vi.fn() }),
}));
vi.mock('@/hooks/useEvents', () => ({
  useEvents: () => ({ events: [], loading: false, fetchEvents: vi.fn() }),
}));
vi.mock('@/hooks/useEntityDetail', () => ({
  useEntityDetail: () => ({ data: village.data, isLoading: false, refetch: vi.fn() }),
}));
vi.mock('@/hooks/useSlugRedirect', () => ({ useSlugRedirect: () => null }));
vi.mock('@/hooks/useTripSafety', () => ({
  useTripSafety: () => ({
    status: 'ready',
    hasCriminalizedDestination: false,
    hasDeathPenaltyDestination: false,
  }),
}));
// maplibre's worker URL is not resolvable under vitest.
vi.mock('@/components/map/EntityMap', () => ({ EntityMap: () => <div data-testid="map" /> }));
vi.mock('@/components/discovery/SimilarItems', () => ({ SimilarItems: () => null }));
vi.mock('@/components/discovery/PersonalitiesForEntity', () => ({
  PersonalitiesForEntity: () => null,
}));
vi.mock('@/components/tags/MoreLikeThisByTag', () => ({ MoreLikeThisByTag: () => null }));
vi.mock('@/components/marketplace/MarketplaceForVillage', () => ({
  MarketplaceForVillage: () => null,
}));
vi.mock('@/components/marks/MarkVisitedButton', () => ({ MarkVisitedButton: () => null }));
// Admin/report affordances reach for AuthProvider + admin roles; neither is
// what this file is testing.
vi.mock('@/components/admin/AdminEditButton', () => ({ AdminEditButton: () => null }));
vi.mock('@/components/moderation/ReportButton', () => ({ ReportButton: () => null }));
vi.mock('@/components/admin/inline/Editable', () => ({
  Editable: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/trips/TripCoveringBanner', () => ({ TripCoveringBanner: () => null }));
vi.mock('@/components/trips/PlanTripFromHereButton', () => ({
  PlanTripFromHereButton: (p: { label: string }) => <button type="button">{p.label}</button>,
}));

import QueerVillageDetail from '../QueerVillageDetail';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={['/villages/chueca']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/villages/:slug" element={<QueerVillageDetail />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('QueerVillageDetail', () => {
  it('renders the subway not-found stop when there is no such village', async () => {
    village.data = null;
    renderPage();
    // GatedDetailFallback runs an async gated_entity_exists check for
    // signed-out visitors before falling back to the not-found UI — same
    // reason EventDetail's equivalent test awaits findByText.
    expect(await screen.findByText('No such district.')).toBeInTheDocument();
  });

  it('renders the single with its masthead and census', () => {
    village.data = {
      id: 'v1',
      name: 'Chueca',
      slug: 'chueca',
      description: 'Madrid’s gay district.',
      history: 'Since the 1980s.',
      created_at: '2024-01-01',
      cities: { id: 'c1', slug: 'madrid', name: 'Madrid' },
      countries: { id: 'co1', slug: 'spain', name: 'Spain', equality_score: 85 },
    };
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Chueca' })).toBeInTheDocument();
    expect(screen.getByText('District · Green line')).toBeInTheDocument();
    // The census renders unconditionally, zeros included — a masthead row that
    // appears and disappears shifts the page under the reader. Matched
    // loosely because i18next is not initialised under vitest, so `t` echoes
    // the default string with `{{n}}` un-interpolated.
    expect(document.body.textContent).toMatch(/stops · .*departures · Madrid/);
  });

  it('carries the safety layer the village page never had', () => {
    village.data = {
      id: 'v1',
      name: 'Chueca',
      slug: 'chueca',
      created_at: '2024-01-01',
      cities: { id: 'c1', slug: 'madrid', name: 'Madrid' },
      countries: { id: 'co1', slug: 'spain', name: 'Spain', equality_score: 85 },
    };
    renderPage();
    // GeoSafetyVerdict. Before this rebuild a village in a criminalising
    // country rendered exactly like one in Berlin.
    expect(screen.getByText('Safety')).toBeInTheDocument();
    // The tier, not the raw composite — the 0-100 number was retired.
    expect(screen.getByText(/equality/i)).toBeInTheDocument();
    expect(screen.queryByText('85/100')).not.toBeInTheDocument();
  });
});
