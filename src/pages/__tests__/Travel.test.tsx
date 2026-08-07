/**
 * @vitest-environment jsdom
 *
 * /travel is the Travelling intent, planner-first.
 *
 * The page opens on the trip planner (the most built-out system on the site,
 * and this page is its front door), keeps villages/pride/booking as discovery
 * and transaction sections, and closes with a compact "Know before you go"
 * legal briefing — safety data stays on-page but no longer leads.
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useTrackEvent', () => ({ useTrackEvent: useTrackMock }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: authMock }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('@/hooks/useIntentData', () => ({ useAllCountriesRights: countriesMock }));
vi.mock('@/hooks/useIntentLocation', () => ({ useIntentLocation: intentLocationMock }));
vi.mock('@/components/travel/PrideScroller', () => ({
  PrideScroller: () => <div data-testid="pride" />,
}));
vi.mock('@/components/travel/VillagesRail', () => ({
  VillagesRail: () => <div data-testid="villages" />,
}));
vi.mock('@/components/travel/TripCockpit', () => ({
  TripCockpit: () => <div data-testid="cockpit" />,
}));
vi.mock('@/components/travel/StartTripHero', () => ({
  StartTripHero: () => <div data-testid="start-hero" />,
}));
vi.mock('@/components/trips/TripTemplates', () => ({
  TripTemplates: () => <div data-testid="templates" />,
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
  authMock.mockReset();
  countriesMock.mockReset();
  intentLocationMock.mockReset();
  sessionStorage.clear();

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
  it('leads with the planner and closes with the legal briefing', () => {
    renderAt('/travel');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '');
    expect(headings[0]).toMatch(/plan your trip/i);
    expect(headings[headings.length - 1]).toMatch(/know before you go/i);
  });

  it('shows the trip-create hero to signed-out visitors', () => {
    renderAt('/travel');
    expect(screen.getByTestId('start-hero')).toBeInTheDocument();
    expect(screen.queryByTestId('cockpit')).toBeNull();
  });

  it('shows the trip cockpit to signed-in users', () => {
    authMock.mockReturnValue({ user: { id: 'u1' } });
    renderAt('/travel');
    expect(screen.getByTestId('cockpit')).toBeInTheDocument();
    expect(screen.queryByTestId('start-hero')).toBeNull();
  });

  it('renders templates and public trips for everyone', () => {
    renderAt('/travel');
    expect(screen.getByTestId('templates')).toBeInTheDocument();
    expect(screen.getByTestId('discoverable')).toBeInTheDocument();
  });

  it('renders the villages and pride sections', () => {
    renderAt('/travel');
    expect(screen.getByTestId('villages')).toBeInTheDocument();
    expect(screen.getByTestId('pride')).toBeInTheDocument();
  });

  it('links out to the Rights intent for any country', () => {
    renderAt('/travel');
    expect(screen.getByRole('link', { name: /check any country/i })).toBeInTheDocument();
  });

  it('opens the booking accordion on ?intent=book', () => {
    renderAt('/travel?intent=book');
    expect(screen.getByTestId('book')).toHaveAttribute('data-open', 'true');
  });

  it('opens the booking accordion on ?tab= and ?city= deep links', () => {
    renderAt('/travel?tab=hotels');
    expect(screen.getByTestId('book')).toHaveAttribute('data-open', 'true');
  });

  it('leaves the booking accordion closed by default', () => {
    renderAt('/travel');
    expect(screen.getByTestId('book')).toHaveAttribute('data-open', 'false');
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

  it('fires a planner-first page_view without inventing an entity type', () => {
    // 'intent' is not a member of EntityType; sending one would pollute the
    // personalization bias vector with a synthetic type.
    renderAt('/travel');
    expect(trackFn).toHaveBeenCalled();
    const payload = trackFn.mock.calls[0][0];
    expect(payload.eventType).toBe('page_view');
    expect(payload.entityType).toBeUndefined();
    expect(payload.metadata.layout).toBe('planner-first');
  });
});
