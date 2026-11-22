/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

let mockUser: { id: string; email?: string } | null = null;
let mockUnread = 0;
let mockTrips = 0;
const navigateSpy = vi.fn();
const hapticSpy = vi.fn();

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
vi.mock('@/hooks/useInboxFeed', () => ({ useInboxFeed: () => ({ unreadCount: mockUnread }) }));
vi.mock('@/hooks/useInboxBadge', () => ({ useInboxBadge: () => mockTrips }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigateSpy }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('@/hooks/useHaptics', () => ({ useHaptics: () => ({ trigger: hapticSpy }) }));
// Reduced motion → static pills, no motion/react layout animation in jsdom.
vi.mock('@/lib/motion', () => ({ useMotionTokens: () => ({ reduced: true }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string, opts?: { count?: number }) => {
      const s = fallback ?? _k;
      return opts?.count != null ? s.replace('{{count}}', String(opts.count)) : s;
    },
  }),
}));
// The heavy sheet + auth dialog are exercised in their own specs; here we only
// care that they mount when their open flag flips.
vi.mock('@/components/layout/MobileNavSheet', () => ({
  MobileNavSheet: ({ open }: { open: boolean }) => (open ? <div data-testid="nav-sheet" /> : null),
}));
vi.mock('@/components/layout/MobileYouSheet', () => ({
  MobileYouSheet: ({ open }: { open: boolean }) => (open ? <div>You sheet</div> : null),
}));
vi.mock('@/components/auth/AuthDialog', () => ({
  AuthDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="auth-dialog" /> : null),
}));

import { MobileBottomNav } from '../MobileBottomNav';

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MobileBottomNav />
    </MemoryRouter>,
  );
}

describe('MobileBottomNav', () => {
  beforeEach(() => {
    mockUser = null;
    mockUnread = 0;
    mockTrips = 0;
    navigateSpy.mockClear();
    hapticSpy.mockClear();
  });

  it('renders the four destination tabs (Home, Explore, Hub, You)', () => {
    renderAt('/');
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getByText('Hub')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    // All four tabs are links now (Explore deep-links); contribute + the hub
    // chevron are buttons.
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });

  it('Explore deep-links to the discovery surface (/search)', () => {
    renderAt('/');
    expect(screen.getByText('Explore').closest('a')).toHaveAttribute('href', '/search');
  });

  it('lights the Explore tab on any discovery route', () => {
    renderAt('/venues');
    expect(screen.getByText('Explore').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Home').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('opens the intent sheet from a plain Explore tap, no gesture required', () => {
    // The sheet used to open only on long-press, with a 24px chevron as its
    // sole affordance. An undiscoverable gesture cannot be the entry to
    // primary navigation, so the tab's own tap now opens it.
    renderAt('/');
    expect(screen.queryByTestId('nav-sheet')).toBeNull();
    const notCancelled = fireEvent.click(screen.getByText('Explore'));
    expect(screen.getByTestId('nav-sheet')).toBeInTheDocument();
    // preventDefault() ran → the tap opened the sheet instead of navigating.
    expect(notCancelled).toBe(false);
  });

  it('announces Explore as a dialog trigger', () => {
    renderAt('/');
    const explore = screen.getByText('Explore').closest('a')!;
    expect(explore).toHaveAttribute('aria-haspopup', 'dialog');
    expect(explore).toHaveAttribute('aria-expanded', 'false');
  });

  it('contribute routes signed-in users to the context submit form', () => {
    mockUser = { id: 'u-1' };
    renderAt('/events');
    fireEvent.click(screen.getByLabelText('Submit Event'));
    expect(navigateSpy).toHaveBeenCalledWith('/submit/event');
  });

  it('contribute falls back to the generic hub off a content route', () => {
    mockUser = { id: 'u-1' };
    renderAt('/');
    fireEvent.click(screen.getByLabelText('Contribute'));
    expect(navigateSpy).toHaveBeenCalledWith('/submit');
  });

  it('contribute opens the auth dialog for anon (no navigation)', () => {
    mockUser = null;
    renderAt('/');
    fireEvent.click(screen.getByLabelText('Sign in to contribute'));
    expect(screen.getByTestId('auth-dialog')).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it.each([null, { id: 'u-1' }])('opens the Hub sheet from outside the Hub for user %j', (user) => {
    mockUser = user;
    renderAt('/going-out');
    const hub = screen.getByRole('link', { name: 'Hub' });
    expect(hub).toHaveAttribute('aria-haspopup', 'dialog');
    expect(hub).not.toHaveAttribute('aria-current');
    fireEvent.click(hub);
    const sheet = screen.getByRole('dialog', { name: 'Hub' });
    expect(sheet).toBeInTheDocument();
    expect(sheet.querySelector('[aria-current]')).toBeNull();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  // Meet is public discovery, not the Hub: on /meet/* the dock lights Explore.
  it.each(['/meet', '/meet/groups/g1', '/de/meet/dating'])(
    'lights Explore, not Hub, on %s',
    (path) => {
      renderAt(path);
      expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: 'Hub' })).not.toHaveAttribute('aria-current');
    },
  );

  it('opens Hub navigation from the active dock tab for a signed-out visitor', () => {
    renderAt('/hub/plans');
    const hub = screen.getByRole('link', { name: 'Hub' });
    expect(hub).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.getByRole('link', { name: 'Explore' })).not.toHaveAttribute('aria-current');
    fireEvent.click(hub);
    expect(screen.getByRole('dialog', { name: 'Hub' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plans' })).toHaveAttribute('aria-current', 'page');
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('fires a haptic nudge on tab tap', () => {
    renderAt('/');
    fireEvent.click(screen.getByText('Home'));
    expect(hapticSpy).toHaveBeenCalledWith('nudge');
  });

  // The inbox left the hub (2026-11-22): its badge lives on the header Inbox,
  // so the dock must not double it.
  it('carries no unread badge on the Hub tab', () => {
    mockUser = { id: 'u-1' };
    mockUnread = 5;
    renderAt('/');
    expect(screen.queryByText('5 unread')).toBeNull();
    expect(screen.queryByText('5')).toBeNull();
  });

  it('marks the active destination with aria-current=page', () => {
    renderAt('/hub');
    const hub = screen.getByText('Hub').closest('a');
    expect(hub).toHaveAttribute('aria-current', 'page');
    const home = screen.getByText('Home').closest('a');
    expect(home).not.toHaveAttribute('aria-current');
  });

  it('hides on the full-bleed map route', () => {
    const { container } = renderAt('/map');
    expect(container).toBeEmptyDOMElement();
  });
});
