/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

// The intersection itself is covered in useFriendIds.test.tsx.
let mockCount: number | null = 2;

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me', email: 'me@x.co' }, signOut: vi.fn() }),
}));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: null }) }));
vi.mock('@/hooks/useAdminRoles', () => ({
  useAdminRoles: () => ({ isAdmin: false, isModerator: false }),
}));
vi.mock('@/hooks/useFriendIds', () => ({ useFriendsOnlineCount: () => mockCount }));
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
vi.mock('@/components/notifications/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('@/components/auth/AuthDialog', () => ({ AuthDialog: () => null }));
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

describe('Header user menu — friends online', () => {
  it('shows the online count above Settings, linking to the friends list', async () => {
    mockCount = 2;
    await openMenu();
    const items = screen.getAllByRole('menuitem');
    const friendsIdx = items.findIndex((el) => el.textContent?.includes('Friends'));
    const settingsIdx = items.findIndex((el) =>
      el.textContent?.includes('header.userMenu.settings'),
    );
    expect(friendsIdx).toBeGreaterThanOrEqual(0);
    expect(friendsIdx).toBe(settingsIdx - 1);
    const row = items[friendsIdx];
    expect(row.getAttribute('href')).toBe('/community/friends');
    expect(row.textContent).toContain('2 online');
  });

  it('shows no number while the friend list is loading', async () => {
    mockCount = null;
    await openMenu();
    const row = screen.getAllByRole('menuitem').find((el) => el.textContent?.includes('Friends'));
    expect(row).toBeDefined();
    expect(row!.textContent).not.toContain('online');
  });
});
