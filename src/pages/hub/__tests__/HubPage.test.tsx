/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'u@example.com' }, loading: false }),
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

import HubPage from '../HubPage';

const renderPage = (module?: 'overview' | 'messages' | 'plans' | 'saved') =>
  render(
    <MemoryRouter>
      <HubPage module={module} />
    </MemoryRouter>,
  );

describe('HubPage', () => {
  it('renders the shell nav from the registry with overview as default', () => {
    renderPage();
    expect(screen.getByTestId('module-overview')).toBeTruthy();
    // Desktop + mobile nav both render each of the four module links.
    expect(screen.getAllByRole('link', { name: /Overview/ }).length).toBeGreaterThanOrEqual(1);
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
