/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

let mockUser: { id: string; email?: string } | null = null;
let mockRoles = { isAdmin: false, isModerator: false };

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, signOut: vi.fn() }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
vi.mock('@/hooks/useAdminRoles', () => ({ useAdminRoles: () => mockRoles }));
vi.mock('@/hooks/useInboxBadge', () => ({ useInboxBadge: () => 0 }));
let mockFriendsOnline: number | null = null;
vi.mock('@/hooks/useFriendIds', () => ({ useFriendsOnlineCount: () => mockFriendsOnline }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string, opts?: { count?: number }) =>
      (fallback ?? k).replace('{{count}}', String(opts?.count ?? '')),
  }),
}));
// Leaf controls pull on react-query / theme / currency providers — stub them.
vi.mock('@/components/i18n/LanguageSwitcher', () => ({
  LanguageSwitcher: () => <div data-testid="lang" />,
}));
vi.mock('@/components/i18n/CurrencySelector', () => ({
  CurrencySelector: () => <div data-testid="cur" />,
}));
vi.mock('@/components/theme/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme" />,
}));
vi.mock('@/components/auth/AuthDialog', () => ({ AuthDialog: () => null }));

import { MobileNavSheet } from '../MobileNavSheet';

function renderSheet(open = true, onOpenChange = vi.fn()) {
  return {
    onOpenChange,
    ...render(
      <MemoryRouter>
        <MobileNavSheet open={open} onOpenChange={onOpenChange} />
      </MemoryRouter>,
    ),
  };
}

describe('MobileNavSheet', () => {
  beforeEach(() => {
    mockUser = null;
    mockRoles = { isAdmin: false, isModerator: false };
    mockFriendsOnline = null;
  });

  it('renders nothing when closed', () => {
    renderSheet(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the destination hub when open', () => {
    renderSheet(true);
    expect(document.querySelector('a[href="/venues"]')).not.toBeNull();
    expect(document.querySelector('a[href="/events"]')).not.toBeNull();
    expect(document.querySelector('a[href="/marketplace"]')).not.toBeNull();
  });

  it('shows display controls', () => {
    renderSheet(true);
    expect(screen.getByTestId('lang')).toBeInTheDocument();
    expect(screen.getByTestId('cur')).toBeInTheDocument();
    // Dark mode came back 2026-08-18; this asserted the toggle was ABSENT for
    // nine days in between.
    expect(screen.getByTestId('theme')).toBeInTheDocument();
  });

  it('offers sign-in for anon and sign-out for signed-in users', () => {
    renderSheet(true);
    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.queryByText('Sign Out')).toBeNull();

    mockUser = { id: 'u-1', email: 'a@b.co' };
    renderSheet(true);
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });

  it('shows the admin link only to admins/moderators', () => {
    renderSheet(true);
    expect(document.querySelector('a[href="/admin"]')).toBeNull();

    mockUser = { id: 'u-1' };
    mockRoles = { isAdmin: true, isModerator: false };
    renderSheet(true);
    expect(document.querySelector('a[href="/admin"]')).not.toBeNull();
  });

  it('closes the sheet when a destination is tapped', () => {
    const { onOpenChange } = renderSheet(true);
    const link = document.querySelector('a[href="/venues"]') as HTMLAnchorElement;
    fireEvent.click(link);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a friends row with the online count for signed-in users only', () => {
    renderSheet(true);
    expect(document.querySelector('a[href="/community/friends"]')).toBeNull();

    mockUser = { id: 'u-1', email: 'a@b.co' };
    mockFriendsOnline = 3;
    renderSheet(true);
    const row = document.querySelector('a[href="/community/friends"]');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('Friends');
    expect(row!.textContent).toContain('3 online');
  });
});
