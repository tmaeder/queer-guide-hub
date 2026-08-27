/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
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

import People from '../People';

beforeEach(() => {
  profile.user_mode = null;
  location.cityId = 'city-1';
  location.cityName = 'Zürich';
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
  // EditorialDetailLayout prints each section label twice — once in the sticky
  // section nav, once as the heading — so these are getAllByText by necessity.
  it('leads with places and groups, not with a member grid', () => {
    renderWithProviders(<People />);
    expect(screen.getAllByText('Community spaces').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Groups to join').length).toBeGreaterThan(0);
    expect(screen.getByText('Kaserne')).toBeInTheDocument();
    expect(screen.getByText('Queer Hiking')).toBeInTheDocument();
  });

  // The hub used to open on one of four person-matching tabs, every one of
  // which needs a populated member pool that does not exist. They are now their
  // own routes (/people/friends etc.) and must not reappear on the hub.
  it('does not render the retired mode tabs', () => {
    renderWithProviders(<People />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText('Travel buddies')).not.toBeInTheDocument();
  });

  it('shows the honest member notice instead of an empty rail', () => {
    renderWithProviders(<People />);
    expect(screen.getByTestId('member-notice')).toBeInTheDocument();
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

  // `/community/groups` is the LIST page; the detail route is `/groups/:groupId`.
  // This card pointed at `/community/groups/:id`, which matches no route and so
  // 404'd every group on the hub — 14 reports on the admin error board, all of
  // them real, public, otherwise-reachable groups.
  it('links a group to the group detail route, not under the community list', () => {
    renderWithProviders(<People />);
    expect(screen.getByRole('link', { name: 'Queer Hiking' })).toHaveAttribute(
      'href',
      '/groups/g1',
    );
  });

  it('says so when the spaces came from the country rather than the city', () => {
    spacesScope = 'country';
    renderWithProviders(<People />);
    expect(screen.getByText(/Nothing is listed in Zürich itself/)).toBeInTheDocument();
  });

  // EditorialDetailLayout prints a section's label and "see all" action even
  // when its content resolves to null, so an empty city-gated section left a
  // heading standing over nothing — and put a dead entry in the section nav.
  it('drops a section entirely rather than heading an empty one', () => {
    location.cityId = null;
    location.cityName = null;
    renderWithProviders(<People />);
    expect(screen.queryByText('Bars and cafés')).not.toBeInTheDocument();
    // The sections that do have something to say are still there.
    expect(screen.getAllByText('Groups to join').length).toBeGreaterThan(0);
  });

  it('keeps every card click target out of a nested anchor', () => {
    const { container } = renderWithProviders(<People />);
    expectNoNestedInteractive(container);
  });
});
