/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';

const metaCalls: { title?: string; canonicalPath?: string }[] = [];

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, d?: string) => d ?? k }),
}));
// MeetNav (via MeetNavBar) is real page chrome here, and it reads the signed-in
// user to decide whether the Dating tab shows. These specs render
// without an AuthProvider, so stub the hook rather than drop the bar — the bar
// is part of what the nested-anchor assertion below is checking.
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('@/hooks/useMeta', () => ({
  useMeta: (opts: { title?: string; canonicalPath?: string }) => {
    metaCalls.push(opts);
  },
}));
vi.mock('../PeopleModeView', () => ({
  PeopleModeView: ({ mode }: { mode: string }) => <div data-testid="mode-view">{mode}</div>,
}));
vi.mock('../NearbyView', () => ({ NearbyView: () => <div data-testid="nearby-view">nearby</div> }));
vi.mock('@/pages/intimate/IntimateDiscovery', () => ({
  default: () => <div data-testid="dating-deck">dating</div>,
}));
vi.mock('@/components/people/IntentSheet', () => ({ IntentSheet: () => null }));
vi.mock('@/components/people/MeetMembersNotice', () => ({
  MeetMembersNotice: () => <div data-testid="member-notice" />,
}));

import PeopleMode from '../PeopleMode';

beforeEach(() => {
  metaCalls.length = 0;
});

describe('PeopleMode', () => {
  it('renders the friends matching view', () => {
    renderWithProviders(<PeopleMode tab="friends" />);
    expect(screen.getByTestId('mode-view')).toHaveTextContent('friends');
  });

  it('renders the travel matching view', () => {
    renderWithProviders(<PeopleMode tab="travel" />);
    expect(screen.getByTestId('mode-view')).toHaveTextContent('travel');
  });

  it('renders the nearby view', () => {
    renderWithProviders(<PeopleMode tab="nearby" />);
    expect(screen.getByTestId('nearby-view')).toBeInTheDocument();
  });

  it('renders the age-walled dating deck', async () => {
    renderWithProviders(<PeopleMode tab="dating" />);
    // Lazy-loaded behind Suspense.
    expect(await screen.findByTestId('dating-deck')).toBeInTheDocument();
  });

  // All four modes previously shared the hub's meta, so /meet/dating and
  // /meet/nearby were indistinguishable to a crawler and in a browser tab.
  it('gives each mode its own title and canonical path', () => {
    renderWithProviders(<PeopleMode tab="nearby" />);
    expect(metaCalls[0]?.canonicalPath).toBe('/meet/nearby');
    expect(metaCalls[0]?.title).toMatch(/nearby/i);
  });

  it('offers a way back to Meet', () => {
    renderWithProviders(<PeopleMode tab="travel" />, { route: '/meet/travel' });
    expect(screen.getByRole('link', { name: /^People$/ })).toHaveAttribute('href', '/meet');
    expect(screen.getByRole('link', { name: /Travel buddies/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
