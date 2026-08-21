/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({ country: null as unknown }));
const milestones = vi.hoisted(() => ({ data: [] as unknown[] }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));
vi.mock('@/hooks/useTrackEvent', () => ({ useTrackEvent: () => ({ track: vi.fn() }) }));
vi.mock('@/hooks/useTrackView', () => ({ useTrackView: () => {} }));
vi.mock('@/hooks/useSlugRedirect', () => ({ useSlugRedirect: () => null }));
vi.mock('@/hooks/useWorldBankData', () => ({ useWorldBankData: () => ({ hasData: false }) }));
vi.mock('@/hooks/useSDGData', () => ({ useSDGData: () => ({ hasData: false }) }));
vi.mock('@/hooks/usePlaces', () => ({
  useOptimizedCountry: () => ({ country: state.country, loading: false, refetch: vi.fn() }),
  useOptimizedCities: () => ({ cities: [], loading: false }),
}));
vi.mock('@/hooks/useVenues', () => ({
  useVenues: () => ({ venues: [], loading: false, fetchVenues: vi.fn() }),
}));
vi.mock('@/hooks/useEvents', () => ({
  useEvents: () => ({ events: [], loading: false, fetchEvents: vi.fn() }),
}));
vi.mock('@/hooks/useNews', () => ({
  useNews: () => ({
    articles: [],
    loading: false,
    fetchArticles: vi.fn(),
    incrementViews: vi.fn(),
  }),
}));
vi.mock('@/hooks/useMilestones', () => ({
  useMilestonesForCountry: () => ({ data: milestones.data }),
}));
// maplibre's worker URL is not resolvable under vitest.
vi.mock('@/components/map/EntityMap', () => ({ EntityMap: () => <div data-testid="map" /> }));
vi.mock('@/components/admin/AdminEditButton', () => ({ AdminEditButton: () => null }));
vi.mock('@/components/moderation/ReportButton', () => ({ ReportButton: () => null }));
vi.mock('@/components/trips/PlanTripFromHereButton', () => ({
  PlanTripFromHereButton: (p: { label: string }) => <button type="button">{p.label}</button>,
}));
vi.mock('@/components/trips/TripCoveringBanner', () => ({ TripCoveringBanner: () => null }));
vi.mock('@/components/discovery/SimilarItems', () => ({ SimilarItems: () => null }));
vi.mock('@/components/discovery/PersonalitiesForEntity', () => ({
  PersonalitiesForEntity: () => null,
}));
vi.mock('@/components/discovery/NearbyTriptych', () => ({ NearbyTriptych: () => null }));
vi.mock('@/components/marketplace/MarketplaceForCountry', () => ({
  MarketplaceForCountry: () => null,
}));
vi.mock('@/components/travel/TravelDealsSection', () => ({ TravelDealsSection: () => null }));
vi.mock('@/components/activities/ActivitiesWidget', () => ({ ActivitiesWidget: () => null }));

import CountryDetail from '../CountryDetail';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={['/country/germany']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/country/:slug" element={<CountryDetail />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const germany = {
  id: 'co1',
  name: 'Germany',
  slug: 'germany',
  code: 'DE',
  capital: 'Berlin',
  population: 84_000_000,
  equality_score: 83,
  description: 'Federal republic in central Europe.',
  created_at: '2024-01-01',
};

describe('CountryDetail', () => {
  it('renders the not-found stop when there is no such country', () => {
    state.country = null;
    renderPage();
    expect(screen.getByText('Country not found')).toBeInTheDocument();
  });

  it('leads with a typographic masthead', () => {
    state.country = germany;
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: /Germany/ })).toBeInTheDocument();
  });

  it('keeps the criminalisation banner INSIDE the page container', () => {
    // It used to render as a sibling of the layout, i.e. outside
    // PageContainer, so it ignored the site gutter.
    state.country = {
      ...germany,
      name: 'Uganda',
      slug: 'uganda',
      lgbti_criminalization: { legal: false, penalty: 'Life imprisonment' },
    };
    const { container } = renderPage();
    const banner = screen.getByText(/Travel Warning/);
    const page = container.querySelector('article');
    expect(page).not.toBeNull();
    expect(page?.contains(banner)).toBe(true);
  });

  it('does not render the legal record when the country has no dated milestones', () => {
    // Module 12 is this type's OWNER module, but rule 2 still applies: an
    // empty history is a shorter page, not an empty frame.
    state.country = germany;
    renderPage();
    expect(screen.queryByText('Legal record')).not.toBeInTheDocument();
  });

  it('renders the legal record inside #rights, keeping the #history deep-link target', () => {
    // The record is a sub-block of rights, not its own section — but old
    // `#history` links must still land, so the wrapper carries the id.
    milestones.data = [
      { id: 'm1', date: '2017-10-01', title: 'Marriage equality', category: 'legal' },
    ];
    const { container } = renderPage();
    const history = container.querySelector('#history');
    expect(history).not.toBeNull();
    expect(container.querySelector('section#rights')?.contains(history)).toBe(true);
    // And it is no longer a station on the route rail.
    expect(container.querySelector('section#history')).toBeNull();
    milestones.data = [];
  });

  it('renders the merged fact sheet once — capital appears exactly once', () => {
    // FactGrid + CountryPracticalInfo were the same idea twice; the fact
    // sheet is the single surviving fact surface.
    state.country = germany;
    renderPage();
    expect(screen.getAllByText('Capital')).toHaveLength(1);
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('84.0M')).toBeInTheDocument();
  });
});
