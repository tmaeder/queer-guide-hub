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
}));
vi.mock('@/hooks/useMeta', () => ({ useMeta: () => {} }));
vi.mock('@/components/hub/modules/OverviewModule', () => ({
  OverviewModule: () => <div data-testid="module-overview" />,
}));
vi.mock('@/components/hub/modules/MessagesModule', () => ({
  MessagesModule: () => <div data-testid="module-messages" />,
}));
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

const renderPage = (module?: 'overview' | 'feed' | 'messages' | 'plans' | 'saved') =>
  render(
    <MemoryRouter>
      <HubPage module={module} />
    </MemoryRouter>,
  );

describe('HubPage', () => {
  beforeEach(() => {
    authState.user = { id: 'u1', email: 'u@example.com' };
  });

  it('renders the shell nav from the registry with overview as default', () => {
    renderPage();
    expect(screen.getByTestId('module-overview')).toBeTruthy();
    // Desktop + mobile nav both render each of the five module links.
    expect(screen.getAllByRole('link', { name: /Overview/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /Feed/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /Messages/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /Plans/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /Saved/ }).length).toBeGreaterThanOrEqual(1);
    // Active module carries aria-current.
    const active = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page');
    expect(active.length).toBeGreaterThanOrEqual(1);
    expect(active[0].textContent).toContain('Overview');
  });

  it('renders the messages module when module="messages"', () => {
    renderPage('messages');
    expect(screen.getByTestId('module-messages')).toBeTruthy();
    expect(screen.queryByTestId('module-overview')).toBeNull();
  });

  it('keeps the feed public while preserving the Hub shell', () => {
    authState.user = null;
    renderPage('feed');

    expect(screen.getByTestId('module-feed')).toHaveAttribute('data-embedded', 'true');
    expect(
      screen.getAllByRole('navigation', { name: 'Hub modules' }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('link', { name: 'Sign In' })).toBeNull();
  });

  it('keeps private modules behind authentication', () => {
    authState.user = null;
    renderPage('messages');

    expect(screen.getByRole('link', { name: 'Sign In' })).toBeTruthy();
    expect(screen.queryByTestId('module-messages')).toBeNull();
  });

  it('renders the plans module when module="plans"', () => {
    renderPage('plans');
    expect(screen.getByTestId('module-plans')).toBeTruthy();
  });

  it('renders the saved module when module="saved"', () => {
    renderPage('saved');
    expect(screen.getByTestId('module-saved')).toBeTruthy();
  });

  it('shows the unread badge on the messages nav entry', () => {
    renderPage();
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
  });

  it('identity block links to the own public profile', () => {
    renderPage();
    const links = screen.getAllByRole('link');
    expect(links.some((a) => a.getAttribute('href')?.includes('/user/u1'))).toBe(true);
  });
});
