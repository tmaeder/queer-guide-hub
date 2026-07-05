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
vi.mock('@/components/hub/modules/InboxModule', () => ({
  InboxModule: () => <div data-testid="module-inbox" />,
}));
vi.mock('@/components/hub/modules/SavedModule', () => ({
  SavedModule: () => <div data-testid="module-saved" />,
}));
vi.mock('@/components/hub/modules/TripsModule', () => ({
  TripsModule: () => <div data-testid="module-trips" />,
}));

import HubPage from '../HubPage';

const renderPage = (module?: 'inbox' | 'saved' | 'trips') =>
  render(
    <MemoryRouter>
      <HubPage module={module} />
    </MemoryRouter>,
  );

describe('HubPage', () => {
  it('renders the shell nav from the registry with inbox as default', () => {
    renderPage();
    expect(screen.getByTestId('module-inbox')).toBeTruthy();
    // Desktop + mobile nav both render each module link.
    expect(screen.getAllByRole('link', { name: /Inbox/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /Saved/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: /Trips/ }).length).toBeGreaterThanOrEqual(1);
    // Active module carries aria-current.
    const active = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page');
    expect(active.length).toBeGreaterThanOrEqual(1);
    expect(active[0].textContent).toContain('Inbox');
  });

  it('renders the saved module when module="saved"', () => {
    renderPage('saved');
    expect(screen.getByTestId('module-saved')).toBeTruthy();
    expect(screen.queryByTestId('module-inbox')).toBeNull();
  });

  it('renders the trips module when module="trips"', () => {
    renderPage('trips');
    expect(screen.getByTestId('module-trips')).toBeTruthy();
  });

  it('shows the unread badge on the inbox nav entry', () => {
    renderPage();
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
  });

  it('identity block links to the own public profile', () => {
    renderPage();
    const links = screen.getAllByRole('link');
    expect(links.some((a) => a.getAttribute('href')?.includes('/user/u1'))).toBe(true);
  });
});
