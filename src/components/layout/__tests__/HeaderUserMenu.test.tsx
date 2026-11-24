/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me', email: 'me@x.co' }, signOut: vi.fn() }),
}));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
vi.mock('@/hooks/useAdminRoles', () => ({
  useAdminRoles: () => ({ isAdmin: false, isModerator: false }),
}));
vi.mock('@/hooks/useSiteBranding', () => ({ useSiteBranding: () => ({}) }));
vi.mock('@/hooks/useCompactHeader', () => ({ useCompactHeader: () => false }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string, opts?: { count?: number }) =>
      (fallback ?? k).replace('{{count}}', String(opts?.count ?? '')),
  }),
}));
vi.mock('@/components/search/UniversalSearchBar', () => ({ UniversalSearchBar: () => null }));
vi.mock('@/components/notifications/HeaderInbox', () => ({ HeaderInbox: () => null }));
vi.mock('@/components/auth/AuthDialog', () => ({ AuthDialog: () => null }));
vi.mock('@/components/people/GoLiveSwitch', () => ({ GoLiveMenuItem: () => null }));
vi.mock('@/components/brand/Wordmark', () => ({ Wordmark: () => null }));

import { Header } from '../Header';

async function openMenu() {
  render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );
  const trigger = screen.getByRole('button', { name: 'Open user menu' });
  await userEvent.click(trigger);
}

describe('Header user menu', () => {
  it('lists profile, hub and settings, but not Friends (a Hub tab)', async () => {
    await openMenu();
    const hrefs = screen.getAllByRole('menuitem').map((el) => el.getAttribute('href'));
    expect(hrefs).toContain('/user/me');
    expect(hrefs).toContain('/hub');
    expect(hrefs).toContain('/settings');
    expect(hrefs).not.toContain('/hub/friends');
    expect(screen.queryByRole('menuitem', { name: /friends/i })).toBeNull();
  });
});
