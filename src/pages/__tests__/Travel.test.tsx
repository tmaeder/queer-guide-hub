/**
 * @vitest-environment jsdom
 *
 * /travel is the Travelling intent, rebuilt in place on IntentPageLayout.
 *
 * These assertions replaced the old STATE A/B/C trip-cockpit tests. The page no
 * longer opens on a trip hero: it opens on "is it safe for me?", because that is
 * the question a queer traveller asks first and the only one our data answers
 * completely (250 of 250 countries carry a criminalisation status). The trip
 * tooling — which serves 8 trips in the entire database — is demoted to a
 * self-hiding section for signed-in users.
 *
 * The route path is unchanged on purpose, so the rebuild cannibalises none of
 * its existing meta or rankings.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const { useTrackMock, trackFn, hasActiveTripMock, authMock, countriesMock, intentLocationMock } =
  vi.hoisted(() => ({
    useTrackMock: vi.fn(),
    trackFn: vi.fn(),
    hasActiveTripMock: vi.fn(),
    authMock: vi.fn(),
    countriesMock: vi.fn(),
    intentLocationMock: vi.fn(),
  }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useTrackEvent', () => ({ useTrackEvent: useTrackMock }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: authMock }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('@/hooks/useIntentData', () => ({ useAllCountriesRights: countriesMock }));
vi.mock('@/hooks/useIntentLocation', () => ({ useIntentLocation: intentLocationMock }));
vi.mock('@/hooks/useMeaningfulTrips', () => ({
  useHasMeaningfulActiveTrip: () => hasActiveTripMock(),
  usePrimaryMeaningfulTrip: () => null,
  useMeaningfulTrips: () => [],
}));
vi.mock('@/components/travel/ResumeTripStrip', () => ({
  ResumeTripStrip: () => <div data-testid="resume" />,
}));
vi.mock('@/components/travel/PrideScroller', () => ({
  PrideScroller: () => <div data-testid="pride" />,
}));
vi.mock('@/components/travel/InspirationGrid', () => ({
  InspirationGrid: () => <div data-testid="inspire" />,
}));
vi.mock('@/components/travel/VillagesRail', () => ({
  VillagesRail: () => <div data-testid="villages" />,
}));
vi.mock('@/components/travel/TripCockpit', () => ({
  TripCockpit: () => <div data-testid="cockpit" />,
}));
vi.mock('@/components/travel/DiscoverableTripsRail', () => ({
  DiscoverableTripsRail: () => <div data-testid="discoverable" />,
}));
vi.mock('@/components/travel/BrowseVisitedToolbar', () => ({
  BrowseVisitedToolbar: () => <div data-testid="visited-toolbar" />,
}));
vi.mock('@/components/travel/BookNowAccordion', () => ({
  BookNowAccordion: (p: { defaultOpen: boolean }) => (
    <div data-testid="book" data-open={String(p.defaultOpen)} />
  ),
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
  hasActiveTripMock.mockReset();
  authMock.mockReset();
  countriesMock.mockReset();
  intentLocationMock.mockReset();
  sessionStorage.clear();

  useTrackMock.mockReturnValue({ track: trackFn });
  hasActiveTripMock.mockReturnValue(false);
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
  it('leads with safety, not with trip planning', () => {
    renderAt('/travel');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '');
    expect(headings[0]).toMatch(/safe/i);
  });

  it('links out to the Rights intent for any country', () => {
    renderAt('/travel');
    expect(screen.getByRole('link', { name: /check any country/i })).toBeInTheDocument();
  });

  it('renders the destination, villages and pride sections', () => {
    renderAt('/travel');
    expect(screen.getByTestId('inspire')).toBeInTheDocument();
    expect(screen.getByTestId('villages')).toBeInTheDocument();
    expect(screen.getByTestId('pride')).toBeInTheDocument();
  });

  it('opens the booking accordion on ?intent=book', () => {
    renderAt('/travel?intent=book');
    expect(screen.getByTestId('book')).toHaveAttribute('data-open', 'true');
  });

  it('leaves the booking accordion closed by default', () => {
    renderAt('/travel');
    expect(screen.getByTestId('book')).toHaveAttribute('data-open', 'false');
  });

  it('hides the trip tooling from signed-out visitors', () => {
    // 8 trips exist in the whole database — a personal tool, not a public
    // destination, so it must not occupy space for anonymous readers.
    renderAt('/travel');
    expect(screen.queryByTestId('cockpit')).toBeNull();
    expect(screen.queryByTestId('discoverable')).toBeNull();
  });

  it('shows the trip tooling to signed-in users, below everything else', () => {
    authMock.mockReturnValue({ user: { id: 'u1' } });
    renderAt('/travel');
    expect(screen.getByTestId('cockpit')).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '');
    expect(headings[headings.length - 1]).toMatch(/your trips/i);
  });

  it('surfaces the visitor country and its legal status when geo resolves', () => {
    intentLocationMock.mockReturnValue({
      cityId: null,
      citySlug: null,
      cityName: null,
      countryCode: 'TL',
      loading: false,
      inferred: true,
    });
    renderAt('/travel');
    expect(screen.getByText(/Testland/)).toBeInTheDocument();
    expect(screen.getByText(/criminalised/i)).toBeInTheDocument();
  });

  it('fires a page_view without inventing an entity type', () => {
    // 'intent' is not a member of EntityType; sending one would pollute the
    // personalization bias vector with a synthetic type.
    renderAt('/travel');
    expect(trackFn).toHaveBeenCalled();
    const payload = trackFn.mock.calls[0][0];
    expect(payload.eventType).toBe('page_view');
    expect(payload.entityType).toBeUndefined();
  });
});
