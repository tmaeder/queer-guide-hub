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

  it('leaves display controls and legal links to the footer', () => {
    renderSheet(true);
    expect(screen.queryByTestId('lang')).toBeNull();
    expect(screen.queryByTestId('cur')).toBeNull();
    expect(screen.queryByTestId('theme')).toBeNull();
    expect(document.querySelector('a[href="/privacy"]')).toBeNull();
  });

  it('offers sign-in for anon; account rows live in the You sheet', () => {
    renderSheet(true);
    expect(screen.getByText('Sign in')).toBeInTheDocument();

    mockUser = { id: 'u-1', email: 'a@b.co' };
    mockRoles = { isAdmin: true, isModerator: false };
    renderSheet(true);
    expect(screen.queryByText('Sign Out')).toBeNull();
    expect(document.querySelector('a[href="/admin"]')).toBeNull();
    expect(document.querySelector('a[href="/hub/friends"]')).toBeNull();
  });

  it('closes the sheet when a destination is tapped', () => {
    const { onOpenChange } = renderSheet(true);
    const link = document.querySelector('a[href="/venues"]') as HTMLAnchorElement;
    fireEvent.click(link);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // Intents used to be listed, then every destination again (Travel, News and
  // People appeared twice). One list now: every href exactly once.
  it('lists each destination once, including History', () => {
    renderSheet(true);
    const hrefs = [...document.querySelectorAll('[role="dialog"] a[href]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs.length).toBeGreaterThan(15);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toContain('/history');
    expect(hrefs).toContain('/organizations');
  });
});
