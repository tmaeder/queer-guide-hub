/**
 * @vitest-environment jsdom
 *
 * /travel is the Travelling intent, with a destination in the opening.
 *
 * The page opens on the trip finder (Inspire me / I know where I'm going,
 * ending in every booking link), then villages and pride as discovery
 * sections. /travel/book and /travel/plan redirect here.
 *
 * The route path is unchanged on purpose, so the rebuild cannibalises none of
 * its existing meta or rankings.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const { useTrackMock, trackFn, authMock, countriesMock, intentLocationMock } = vi.hoisted(() => ({
  useTrackMock: vi.fn(),
  trackFn: vi.fn(),
  authMock: vi.fn(),
  countriesMock: vi.fn(),
  intentLocationMock: vi.fn(),
}));
const legacy = vi.hoisted(() => ({ pending: false }));
const activeTrip = vi.hoisted(() => ({
  current: null as { id: string; primary_city_name: string } | null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useTrackEvent', () => ({ useTrackEvent: useTrackMock }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: authMock }));
vi.mock('@/hooks/useActiveTrip', () => ({
  useOptionalActiveTrip: () => ({ activeTrip: activeTrip.current }),
}));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('@/hooks/useIntentData', () => ({ useAllCountriesRights: countriesMock }));
vi.mock('@/hooks/useIntentLocation', () => ({ useIntentLocation: intentLocationMock }));
vi.mock('@/hooks/useLegacyTravelParams', () => ({ useLegacyTravelParams: () => legacy.pending }));
vi.mock('@/components/travel/PrideScroller', () => ({
  PrideScroller: () => <div data-testid="pride" />,
}));
vi.mock('@/components/travel/VillagesRail', () => ({
  VillagesRail: () => <div data-testid="villages" />,
}));
vi.mock('@/components/travel/PersonalisedTripPackages', () => ({
  PersonalisedTripPackages: () => <div data-testid="personalised-packages" />,
}));
vi.mock('@/components/travel/DiscoverableTripsRail', () => ({
  DiscoverableTripsRail: () => <div data-testid="discoverable" />,
}));
vi.mock('@/components/travel/BrowseVisitedToolbar', () => ({
  BrowseVisitedToolbar: () => <div data-testid="visited-toolbar" />,
}));
vi.mock('@/components/travel/TravelDiscoveryMap', () => ({
  TravelDiscoveryMap: () => <div data-testid="discovery-map" />,
}));
vi.mock('@/components/travel/TravelCoverStory', () => ({
  TravelCoverStory: () => <div data-testid="cover-story" />,
}));
vi.mock('@/components/travel/GoNowRail', () => ({
  GoNowRail: () => <div data-testid="go-now" />,
}));
vi.mock('@/components/travel/DestinationGrid', () => ({
  DestinationGrid: () => <div data-testid="destination-grid" />,
}));
vi.mock('@/components/guides/GuidesRail', () => ({
  GuidesRail: () => <div data-testid="guides-rail" />,
}));
vi.mock('@/components/discovery/TrendingStrip', () => ({
  TrendingStrip: () => <div data-testid="trending-strip" />,
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

import Travel from '../Travel';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/travel" element={<Travel />} />
      </Routes>
    </MemoryRouter>,
  );
}

const CRIMINALISING = {
  id: 'c1',
  name: 'Testland',
  slug: 'testland',
  code: 'TL',
  equality_score: 12,
  lgbti_criminalization: { legal: false },
  lgbti_same_sex_unions: null,
};

beforeEach(() => {
  useTrackMock.mockReset();
  trackFn.mockReset();
  authMock.mockReset();
  countriesMock.mockReset();
  intentLocationMock.mockReset();
  sessionStorage.clear();
  activeTrip.current = null;
  legacy.pending = false;

  useTrackMock.mockReturnValue({ track: trackFn });
  authMock.mockReturnValue({ user: null });
  countriesMock.mockReturnValue({ data: [CRIMINALISING], isLoading: false, error: null });
  intentLocationMock.mockReturnValue({
    cityId: null,
    citySlug: null,
    cityName: null,
    countryCode: null,
    loading: false,
    inferred: false,
  });
});

describe('Travel page (Travelling intent)', () => {
  it('puts the cover before the planner', () => {
    renderAt('/travel');
    expect(screen.getByTestId('cover-story').closest('header')).toContainElement(
      screen.getByRole('heading', { level: 1 }),
    );
    expect(
      screen
        .getByTestId('cover-story')
        .compareDocumentPosition(screen.getByTestId('personalised-packages')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '');
    expect(headings[0]).toMatch(/find your escape/i);
    expect(headings.some((h) => /know before you go|see the map/i.test(h))).toBe(false);
  });

  it('does not repeat the Find your escape tab as a visible heading', () => {
    renderAt('/travel');
    const heading = screen.getByRole('heading', { level: 2, name: /find your escape/i });
    // Still names the section for screen readers, just not drawn a second time.
    expect(heading).toHaveClass('sr-only');
    expect(heading.closest('section')).toHaveAttribute('aria-labelledby', heading.id);
    expect(screen.getByRole('heading', { level: 2, name: /where to go/i })).not.toHaveClass(
      'sr-only',
    );
  });

  it('leaves resuming the active trip to the floating trip bar', () => {
    // A second "Planning …" header and button stacked above the finder.
    authMock.mockReturnValue({ user: { id: 'u1' } });
    activeTrip.current = { id: 'trip-1', primary_city_name: 'Zürich' };
    renderAt('/travel');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Trips made for you');
    expect(screen.queryByRole('link', { name: 'Continue planning' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Travel sections' })).toBeNull();
    expect(screen.getByTestId('cover-story')).toBeInTheDocument();
  });

  it('renders the personalized planner and public trips for everyone', () => {
    renderAt('/travel');
    expect(screen.getByTestId('personalised-packages')).toBeInTheDocument();
    expect(screen.getByTestId('discoverable')).toBeInTheDocument();
  });

  it('renders the inspiration, villages and pride sections', () => {
    renderAt('/travel');
    expect(screen.getByTestId('go-now')).toBeInTheDocument();
    expect(screen.getByTestId('villages')).toBeInTheDocument();
    expect(screen.getByTestId('pride')).toBeInTheDocument();
  });

  it('holds the trip finder back while an old booking link is translated', () => {
    legacy.pending = true;
    renderAt('/travel?tab=hotels&city=Berlin');
    expect(screen.queryByTestId('personalised-packages')).toBeNull();
    expect(screen.getByTestId('cover-story')).toBeInTheDocument();
  });

  it('fires a destination-led page_view without inventing an entity type', () => {
    // 'intent' is not a member of EntityType; sending one would pollute the
    // personalization bias vector with a synthetic type.
    renderAt('/travel');
    expect(trackFn).toHaveBeenCalled();
    const payload = trackFn.mock.calls[0][0];
    expect(payload.eventType).toBe('page_view');
    expect(payload.entityType).toBeUndefined();
    expect(payload.metadata.layout).toBe('destination-led');
  });
});
