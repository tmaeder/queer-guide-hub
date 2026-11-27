/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

let mockUser: { id: string; email?: string } | null = null;
let mockRoles = { isAdmin: false, isModerator: false };

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, signOut: vi.fn() }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => mockRoles }));
vi.mock('@/hooks/useInboxBadge', () => ({ useInboxBadge: () => 0 }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string, opts?: { count?: number }) =>
      (fallback ?? k).replace('{{count}}', String(opts?.count ?? '')),
  }),
}));

import { MobileYouSheet } from '../MobileYouSheet';

function renderSheet() {
  return render(
    <MemoryRouter>
      <MobileYouSheet open onOpenChange={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('MobileYouSheet', () => {
  beforeEach(() => {
    mockUser = { id: 'u-1', email: 'a@b.co' };
    mockRoles = { isAdmin: false, isModerator: false };
  });

  it('renders nothing for anon', () => {
    mockUser = null;
    renderSheet();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('links your profile, provides settings in place, and signs out', () => {
    renderSheet();
    expect(document.querySelector('a[href="/user/u-1"]')).not.toBeNull();
    expect(document.querySelector('a[href="/settings"]')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });

  it('shows the admin link only to admins/moderators', () => {
    renderSheet();
    expect(document.querySelector('a[href="/admin"]')).toBeNull();
    mockRoles = { isAdmin: true, isModerator: false };
    renderSheet();
    expect(document.querySelector('a[href="/admin"]')).not.toBeNull();
  });

  // Trips (Plans) and Friends are Hub tiles; the You menu is profile + account.
  it('does not list Hub tabs (Plans, Friends)', () => {
    renderSheet();
    expect(document.querySelector('a[href="/user/u-1"]')).not.toBeNull();
    expect(document.querySelector('a[href="/hub/plans"]')).toBeNull();
    expect(document.querySelector('a[href="/hub/friends"]')).toBeNull();
  });
});
