/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({ city: null as unknown }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));
vi.mock('@/hooks/useFavorites', () => ({
  useFavorites: () => ({ toggleFavorite: vi.fn(), isFavorited: () => false }),
}));
vi.mock('@/hooks/useCityImages', () => ({
  useCityImages: () => ({ fetchCityImage: vi.fn().mockResolvedValue(null) }),
}));
vi.mock('@/hooks/useNews', () => ({
  useNews: () => ({ articles: [], loading: false, fetchArticles: vi.fn() }),
}));
vi.mock('@/hooks/useVenues', () => ({
  useVenues: () => ({ venues: [], loading: false, fetchVenues: vi.fn() }),
}));
vi.mock('@/hooks/useEvents', () => ({
  useEvents: () => ({ events: [], loading: false, fetchEvents: vi.fn() }),
}));
vi.mock('@/hooks/usePlaces', () => ({
  useOptimizedCity: () => ({ city: state.city, loading: false, refetch: vi.fn() }),
  useOptimizedCountry: () => ({ country: null, loading: false }),
}));
vi.mock('@/hooks/useQueerVillages', () => ({
  useQueerVillages: () => ({ villages: [], loading: false, fetchVillages: vi.fn() }),
}));
vi.mock('@/hooks/useNearestAirport', () => ({ useNearestAirport: () => ({ nearestAirport: null }) }));
vi.mock('@/hooks/useTrackEvent', () => ({ useTrackEvent: () => ({ track: vi.fn() }) }));
vi.mock('@/hooks/useTrackView', () => ({ useTrackView: () => {} }));
vi.mock('@/hooks/useTripSafety', () => ({
  useTripSafety: () => ({
    status: 'ready',
    hasCriminalizedDestination: false,
    hasDeathPenaltyDestination: false,
  }),
}));
// maplibre's worker URL is not resolvable under vitest.
vi.mock('@/components/map/EntityMap', () => ({ EntityMap: () => <div data-testid="map" /> }));
vi.mock('@/hooks/useVisitedPlaceLookup', () => ({ useVisitedPlaceLookup: () => undefined }));
vi.mock('@/components/admin/AdminEditButton', () => ({ AdminEditButton: () => null }));
vi.mock('@/components/moderation/ReportButton', () => ({ ReportButton: () => null }));
vi.mock('@/components/trips/PlanTripFromHereButton', () => ({
  PlanTripFromHereButton: (p: { label: string }) => <button type="button">{p.label}</button>,
}));
vi.mock('@/components/trips/TripCoveringBanner', () => ({ TripCoveringBanner: () => null }));
vi.mock('@/components/trips/CreateTripDialog', () => ({ CreateTripDialog: () => null }));
vi.mock('@/components/discovery/SimilarItems', () => ({ SimilarItems: () => null }));
vi.mock('@/components/discovery/PersonalitiesForEntity', () => ({
  PersonalitiesForEntity: () => null,
}));
vi.mock('@/components/discovery/NearbyTriptych', () => ({ NearbyTriptych: () => null }));
vi.mock('@/components/discovery/TrendingStrip', () => ({ TrendingStrip: () => null }));
vi.mock('@/components/people/PeopleHereRail', () => ({ PeopleHereRail: () => null }));
vi.mock('@/components/personalization/SimilarCities', () => ({ SimilarCities: () => null }));
vi.mock('@/components/guides/GuidesRail', () => ({ GuidesRail: () => null }));
vi.mock('@/components/geo/CityLandmarksRail', () => ({ CityLandmarksRail: () => null }));
vi.mock('@/components/marketplace/MarketplaceForCity', () => ({ MarketplaceForCity: () => null }));
vi.mock('@/components/marketplace/CityLocalSupporterCaption', () => ({
  CityLocalSupporterCaption: () => null,
}));
vi.mock('@/components/travel/CityTravelHub', () => ({ CityTravelHub: () => null }));
vi.mock('@/components/weather/WeatherForecast', () => ({ WeatherForecast: () => null }));

import CityDetail from '../CityDetail';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={['/city/berlin']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/city/:slug" element={<CityDetail />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CityDetail', () => {
  it('renders the not-found stop when there is no such city', () => {
    state.city = null;
    renderPage();
    expect(screen.getByText('City not found')).toBeInTheDocument();
  });

  it('leads with a typographic masthead, not a photo hero', () => {
    state.city = {
      id: 'c1',
      name: 'Berlin',
      slug: 'berlin',
      description: 'Capital of Germany.',
      created_at: '2024-01-01',
      countries: { id: 'co1', slug: 'germany', name: 'Germany', equality_score: 83 },
    };
    renderPage();
    const h1 = screen.getByRole('heading', { level: 1, name: 'Berlin' });
    expect(h1).toBeInTheDocument();
    // The 58vh photo bed is gone: the title is real text, not an overlay on an
    // <img>. 96.5% of cities had no editorial_hook to put under it and ~6% had
    // no usable photograph at all.
    expect(h1.querySelector('img')).toBeNull();
  });

  it('states the safety verdict in the rail once the report has settled', () => {
    state.city = {
      id: 'c1',
      name: 'Berlin',
      slug: 'berlin',
      created_at: '2024-01-01',
      countries: { id: 'co1', slug: 'germany', name: 'Germany', equality_score: 83 },
    };
    renderPage();
    expect(screen.getByText('Safety')).toBeInTheDocument();
    expect(screen.getByText('83/100')).toBeInTheDocument();
  });
});
