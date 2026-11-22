/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { within } from '@testing-library/react';
import { renderWithProviders, screen, expectNoNestedInteractive } from '@/test/test-utils';

const profile = { user_mode: null as string | null };
const location = {
  cityId: 'city-1' as string | null,
  cityName: 'Zürich' as string | null,
  citySlug: 'zurich' as string | null,
  countryCode: 'CH' as string | null,
  loading: false,
  inferred: false,
};

let spaces: {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  kind: 'venue' | 'village';
}[] = [];
let spacesScope: 'city' | 'country' | 'none' = 'city';
let groups: {
  id: string;
  name: string;
  description: string | null;
  member_count: number | null;
}[] = [];

vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile }) }));
vi.mock('@/hooks/useIntentLocation', () => ({ useIntentLocation: () => location }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | Record<string, unknown>) => {
      if (typeof opts === 'string') return opts;
      const template = (opts?.defaultValue as string) ?? key;
      return template.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(opts?.[name] ?? ''));
    },
  }),
}));
vi.mock('@/hooks/useIntentData', () => ({
  useMeetSpaces: () => ({ data: { spaces, scope: spacesScope }, isLoading: false }),
  useLocalGroups: () => ({ data: groups }),
  useEventsWithFallback: () => ({ data: { events: [], window: 'anywhere' } }),
  useNightlifeVenues: () => ({ data: [] }),
  useDestinationCities: () => ({ data: [] }),
}));
// HubNav (via HubNavBar) is real page chrome here, and it reads the signed-in
// user for the identity block and the Messages unread badge. These specs render
// without an AuthProvider, so stub the hook rather than drop the bar — the bar
// is part of what the nested-anchor assertion below is checking.
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => undefined }));
vi.mock('@/components/people/IntentSheet', () => ({ IntentSheet: () => null }));
vi.mock('@/components/safety/GatedContentNotice', () => ({ GatedContentNotice: () => null }));
// The rail is exercised by its own test; here we only care that the hub hands
// it an emptyState rather than letting it render nothing.
vi.mock('@/components/people/PeopleHereRail', () => ({
  PeopleHereRail: ({ emptyState }: { emptyState?: React.ReactNode }) => <>{emptyState}</>,
}));
vi.mock('@/components/people/MeetMembersNotice', () => ({
  MeetMembersNotice: () => <div data-testid="member-notice">members notice</div>,
}));
// Same reason as the two above: it reaches useAuth (via useFollowedTags), which
// throws outside an AuthProvider. This suite renders the page bare on purpose,
// so provider-dependent children are stubbed here and covered by their own
// test — see components/people/__tests__/InterestPicker.test.tsx.
vi.mock('@/components/people/InterestPicker', () => ({
  InterestPicker: () => <div data-testid="interest-picker">interests</div>,
}));
vi.mock('@/components/people/PeopleConnectionMap', () => ({
  default: () => <div data-testid="people-connection-map">connection map</div>,
}));

import People from '../People';

beforeEach(() => {
  profile.user_mode = null;
  location.cityId = 'city-1';
  location.cityName = 'Zürich';
  location.citySlug = 'zurich';
  spacesScope = 'city';
  spaces = [
    {
      id: 's1',
      name: 'Kaserne',
      slug: 'kaserne',
      description: 'A community centre',
      kind: 'venue',
    },
    { id: 's2', name: 'Kreis 4', slug: 'kreis-4', description: null, kind: 'village' },
  ];
  groups = [{ id: 'g1', name: 'Queer Hiking', description: 'We walk', member_count: 12 }];
});

describe('People hub', () => {
  it('opens with the title and intro only (no preferences button or map link)', () => {
    renderWithProviders(<People />);
    const opening = screen.getByRole('heading', { level: 1 }).closest('header')!;
    expect(within(opening).queryByRole('button')).toBeNull();
    expect(within(opening).queryByRole('link', { name: 'Connection map' })).toBeNull();
  });

  it('keeps the connection map reachable after the listings', () => {
    renderWithProviders(<People />);
    expect(
      screen
        .getByRole('heading', { name: 'Kaserne' })
        .compareDocumentPosition(screen.getByRole('heading', { name: 'Connection map' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByText('Connection map').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Open full map' })).toHaveAttribute('href', '/map');
  });

  // EditorialDetailLayout prints each section label twice — once in the sticky
  // section nav, once as the heading — so these are getAllByText by necessity.
  it('leads with places and groups, not with a member grid', () => {
    renderWithProviders(<People />);
    expect(screen.getAllByText('Community spaces').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Groups to join').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Kaserne' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Queer Hiking$/ })).toBeInTheDocument();
  });

  it('uses route links instead of the retired mode tab strip', () => {
    // The Meet tab row links each discovery page.
    renderWithProviders(<People />, { route: '/meet' });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Travel buddies/i })).toHaveAttribute(
      'href',
      '/meet/travel',
    );
    expect(screen.getByRole('link', { name: /^People$/ })).toHaveAttribute('aria-current', 'page');
  });

  it('hides the Dating tab from signed-out visitors', () => {
    renderWithProviders(<People />, { route: '/meet' });
    const nav = screen.getByRole('navigation', { name: 'Meet' });
    expect(nav.querySelector('a[href="/meet/groups"]')).not.toBeNull();
    expect(nav.querySelector('a[href="/meet/dating"]')).toBeNull();
  });

  // Dating is sign-in gated and never shown to a signed-out visitor
  // (docs/plans/2026-11-22-hub-meet-ia-design.md).
  it('shows no Dating entry to signed-out visitors', () => {
    renderWithProviders(<People />, { route: '/meet' });
    expect(screen.getByRole('heading', { name: 'Community spaces' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Dating/i })).toBeNull();
  });

  // A village links to /place/:slug and a community centre to /venues/:slug —
  // sending a village to /venues would hard-404 at the edge, which has no
  // local equivalent to catch it.
  it('routes each space kind to its own detail path', () => {
    renderWithProviders(<People />);
    expect(screen.getByRole('link', { name: 'Kaserne' })).toHaveAttribute(
      'href',
      '/venues/kaserne',
    );
    expect(screen.getByRole('link', { name: 'Kreis 4' })).toHaveAttribute('href', '/place/kreis-4');
  });

  it('links a group to its canonical detail route under People', () => {
    renderWithProviders(<People />);
    expect(screen.getByRole('link', { name: 'Queer Hiking' })).toHaveAttribute(
      'href',
      '/meet/groups/g1',
    );
  });

  it('says so when the spaces came from the country rather than the city', () => {
    spacesScope = 'country';
    renderWithProviders(<People />);
    expect(screen.getByText(/Nothing is listed in Zürich itself/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Kaserne' })).toBeNull();
  });

  // The anchored chip strip was a third navigation layer under the header and
  // the Meet tabs. Sections are plain headings now.
  it('renders sections as headings with no section chip strip', () => {
    renderWithProviders(<People />);
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Community spaces' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Groups to join' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Members' })).toBeInTheDocument();
  });

  // Bars duplicated the Going out tab; it is one link into that page now.
  it('points bars at Going out with a single link and no venue grid', () => {
    renderWithProviders(<People />);
    const section = document.getElementById('regulars')!;
    const links = within(section).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/going-out?city=zurich');
    expect(within(section).queryByRole('list')).toBeNull();
  });

  it('links Going out without a city when none resolved', () => {
    location.cityId = null;
    location.cityName = null;
    location.citySlug = null;
    renderWithProviders(<People />);
    expect(
      screen.getByRole('link', { name: 'Bars, cafés and clubs are on Going out' }),
    ).toHaveAttribute('href', '/going-out');
  });

  it('shows the member directory section, as the notice for signed-out visitors', () => {
    renderWithProviders(<People />);
    const section = document.getElementById('members')!;
    expect(within(section).getByTestId('member-notice')).toBeInTheDocument();
  });

  it('keeps every card click target out of a nested anchor', () => {
    const { container } = renderWithProviders(<People />);
    expectNoNestedInteractive(container);
  });
});
