/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const authState = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: authState.user, loading: false }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: { display_name: 'Alex', username: 'alex', avatar_url: null },
  }),
}));
vi.mock('@/hooks/useInboxFeed', () => ({
  useInboxFeed: () => ({ items: [], loading: false, unreadCount: 3 }),
  // HubNav reads the badge through this now, not through the feed.
  useInboxUnreadCount: () => 3,
}));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('@/components/hub/modules/OverviewModule', () => ({
  OverviewModule: () => <div data-testid="module-overview" />,
}));
vi.mock('@/components/hub/modules/MessagesModule', () => ({}));
vi.mock('@/components/hub/modules/PlansModule', () => ({
  PlansModule: () => <div data-testid="module-plans" />,
}));
vi.mock('@/components/hub/modules/SavedModule', () => ({
  SavedModule: () => <div data-testid="module-saved" />,
}));
vi.mock('@/pages/Feed', () => ({
  default: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="module-feed" data-embedded={String(Boolean(embedded))} />
  ),
}));

import HubPage from '../HubPage';

// Render at the module's real URL. HubNav derives the highlighted pill from the
// pathname rather than from a prop, so a bare MemoryRouter (pathname "/")
// correctly highlights nothing — the old `activeModule` prop let the nav claim
// an active module the address bar did not agree with.
const renderPage = (module?: 'overview' | 'feed' | 'plans' | 'saved') =>
  render(
    <MemoryRouter initialEntries={[!module || module === 'overview' ? '/hub' : `/hub/${module}`]}>
      <HubPage module={module} />
    </MemoryRouter>,
  );

describe('HubPage', () => {
  beforeEach(() => {
    authState.user = { id: 'u1', email: 'u@example.com' };
  });

  it('renders one row of the six personal tabs with Today as default', () => {
    renderPage();
    expect(screen.getByTestId('module-overview')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Hub sections' });
    const names = [...nav.querySelectorAll('a')].map((a) => a.textContent?.trim());
    expect(names).toEqual(['Today', 'Plans', 'Saved', 'Friends', 'Feed', 'Progress']);
    expect(nav.querySelectorAll('ul')).toHaveLength(1);
    const active = [...nav.querySelectorAll('a[aria-current="page"]')];
    expect(active.map((a) => a.textContent?.trim())).toEqual(['Today']);
  });

  it('gates the feed behind sign-in like every other Hub module', () => {
    authState.user = null;
    renderPage('feed');

    expect(screen.getByRole('link', { name: 'Sign In' })).toBeTruthy();
    expect(screen.queryByTestId('module-feed')).toBeNull();
    // The shell nav stays so a signed-out visitor still sees where they are.
    expect(screen.getByRole('navigation', { name: 'Hub sections' })).toBeTruthy();
  });

  it('renders the embedded feed for a signed-in member', () => {
    renderPage('feed');
    expect(screen.getByTestId('module-feed')).toHaveAttribute('data-embedded', 'true');
  });

  it('keeps private modules behind authentication', () => {
    authState.user = null;
    renderPage('plans');

    expect(screen.getByRole('link', { name: 'Sign In' })).toBeTruthy();
    expect(screen.queryByTestId('module-plans')).toBeNull();
  });

  it('renders the plans module when module="plans"', () => {
    renderPage('plans');
    expect(screen.getByTestId('module-plans')).toBeTruthy();
  });

  it('renders the saved module when module="saved"', () => {
    renderPage('saved');
    expect(screen.getByTestId('module-saved')).toBeTruthy();
  });

  it('shows no identity block: the own profile is linked from the account menu, not the hub nav', () => {
    renderPage();
    const links = screen.getAllByRole('link');
    expect(links.some((a) => a.getAttribute('href')?.includes('/user/u1'))).toBe(false);
  });
});
