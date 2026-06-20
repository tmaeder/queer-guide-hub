/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

let mockUser: { id: string } | null = null;
let mockUnread = 0;
const navigateSpy = vi.fn();

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock('@/hooks/useInboxFeed', () => ({ useInboxFeed: () => ({ unreadCount: mockUnread }) }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigateSpy }));
// Reduced motion → static pills, no motion/react layout animation in jsdom.
vi.mock('@/lib/motion', () => ({ useMotionTokens: () => ({ reduced: true }) }));

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
    navigateSpy.mockClear();
  });

  it('always renders five slots, signed out (never collapses)', () => {
    renderAt('/');
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.getByText('Community')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('renders five slots signed in', () => {
    mockUser = { id: 'u-1' };
    renderAt('/');
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it('gates an auth-only tab for anon: routes to /auth with return-to', () => {
    mockUser = null;
    renderAt('/');
    fireEvent.click(screen.getByText('Messages'));
    expect(navigateSpy).toHaveBeenCalledWith('/auth', { state: { from: '/messages' } });
  });

  it('does not gate auth-only tabs when signed in', () => {
    mockUser = { id: 'u-1' };
    renderAt('/');
    fireEvent.click(screen.getByText('Messages'));
    expect(navigateSpy).not.toHaveBeenCalled();
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

  it('hides the unread badge at zero', () => {
    mockUser = { id: 'u-1' };
    mockUnread = 0;
    renderAt('/');
    expect(screen.queryByText(/unread/)).toBeNull();
  });

  it('caps the unread badge at 99+', () => {
    mockUser = { id: 'u-1' };
    mockUnread = 150;
    renderAt('/');
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('marks the active tab with aria-current=page', () => {
    renderAt('/venues');
    const find = screen.getByText('Find').closest('a');
    expect(find).toHaveAttribute('aria-current', 'page');
    const home = screen.getByText('Home').closest('a');
    expect(home).not.toHaveAttribute('aria-current');
  });

  it('hides on the full-bleed map route', () => {
    const { container } = renderAt('/map');
    expect(container).toBeEmptyDOMElement();
  });
});
