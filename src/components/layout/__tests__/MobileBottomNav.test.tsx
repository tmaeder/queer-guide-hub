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
vi.mock('@/hooks/useHaptics', () => ({ useHaptics: () => ({ trigger: hapticSpy }) }));
vi.mock('@/hooks/useScrollDirection', () => ({ useScrollDirection: () => 'up' }));
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

  it('renders the four destination tabs (Home, Explore, Messages, You)', () => {
    renderAt('/');
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
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

  it('opens the destination hub from the Browse-all affordance, not Explore', () => {
    renderAt('/');
    expect(screen.queryByTestId('nav-sheet')).toBeNull();
    fireEvent.click(screen.getByLabelText('Browse all sections'));
    expect(screen.getByTestId('nav-sheet')).toBeInTheDocument();
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

  it('gates Messages for anon: routes to /auth with return-to', () => {
    mockUser = null;
    renderAt('/');
    fireEvent.click(screen.getByText('Messages'));
    expect(navigateSpy).toHaveBeenCalledWith('/auth', { state: { from: '/messages' } });
  });

  it('does not gate Messages when signed in', () => {
    mockUser = { id: 'u-1' };
    renderAt('/');
    fireEvent.click(screen.getByText('Messages'));
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('fires a haptic nudge on tab tap', () => {
    renderAt('/');
    fireEvent.click(screen.getByText('Home'));
    expect(hapticSpy).toHaveBeenCalledWith('nudge');
  });

  it('shows the unread badge only when signed in with unread > 0', () => {
    mockUser = { id: 'u-1' };
    mockUnread = 5;
    renderAt('/');
    expect(screen.getByLabelText('5 unread')).toBeInTheDocument();
  });

  it('hides the unread badge for anon even with a count', () => {
    mockUser = null;
    mockUnread = 5;
    renderAt('/');
    expect(screen.queryByLabelText('5 unread')).toBeNull();
  });

  it('caps the unread badge at 99+', () => {
    mockUser = { id: 'u-1' };
    mockUnread = 150;
    renderAt('/');
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('marks the active destination with aria-current=page', () => {
    renderAt('/messages');
    const messages = screen.getByText('Messages').closest('a');
    expect(messages).toHaveAttribute('aria-current', 'page');
    const home = screen.getByText('Home').closest('a');
    expect(home).not.toHaveAttribute('aria-current');
  });

  it('hides on the full-bleed map route', () => {
    const { container } = renderAt('/map');
    expect(container).toBeEmptyDOMElement();
  });
});
