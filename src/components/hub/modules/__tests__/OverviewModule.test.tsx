/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const state = vi.hoisted(() => ({
  trips: [] as Array<Record<string, unknown>>,
  unread: 0,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }));
vi.mock('@/hooks/useMyAgenda', () => ({ useMyAgenda: () => ({ days: [], loading: false }) }));
vi.mock('@/hooks/useInboxFeed', () => ({
  useInboxFeed: () => ({ items: [], loading: false, unreadCount: state.unread }),
}));
vi.mock('@/hooks/useUserRelationships', () => ({
  useUserRelationships: () => ({
    getPendingRequests: () => [],
    acceptFriendRequest: vi.fn(),
    rejectFriendRequest: vi.fn(),
    loading: false,
  }),
}));
vi.mock('@/hooks/usePageFetchers', () => ({ fetchProfilesByUserIds: vi.fn() }));
vi.mock('@/hooks/useIntimateProfile', () => ({ useMyIntimateProfile: () => ({ data: null }) }));
vi.mock('@/hooks/useIntimateMatches', () => ({ useIntimateMatches: () => ({ data: [] }) }));
vi.mock('@/hooks/useTrips', () => ({
  useTrips: () => ({ data: state.trips, isLoading: false }),
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }));

import { OverviewModule } from '../OverviewModule';

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
const trip = (id: string, title: string, start: string | null, end: string | null) => ({
  id,
  title,
  start_date: start,
  end_date: end,
  status: 'planning',
  timezone: null,
  primary_city_name: null,
});

const renderModule = () =>
  render(
    <MemoryRouter>
      <OverviewModule />
    </MemoryRouter>,
  );

describe('OverviewModule', () => {
  beforeEach(() => {
    state.trips = [];
    state.unread = 0;
  });

  it('shows the soonest upcoming trip, not a past or undated one', () => {
    state.trips = [
      trip('past', 'Old trip', iso(-20), iso(-10)),
      trip('seed', 'Someday', null, null),
      trip('later', 'Later trip', iso(40), iso(45)),
      trip('soon', 'Lisbon', iso(5), iso(9)),
    ];
    renderModule();
    expect(screen.getByRole('heading', { name: /Next trip/ })).toBeTruthy();
    const link = screen.getByRole('link', { name: /Lisbon/ });
    expect(link.getAttribute('href')).toBe('/trips/soon');
    // Dates plus the countdown phrase (the test i18n stub leaves {{count}} raw).
    expect(link.textContent).toMatch(/ – .*· in /i);
    expect(screen.queryByText('Later trip')).toBeNull();
    expect(screen.queryByText(/Nothing needs you/)).toBeNull();
  });

  it('prefers a trip in progress', () => {
    // Marked active although its dates start later: start-date order alone would pick Lisbon.
    state.trips = [
      trip('soon', 'Lisbon', iso(3), iso(6)),
      { ...trip('live', 'Berlin', iso(10), iso(12)), status: 'active' },
    ];
    renderModule();
    expect(screen.getByRole('link', { name: /Berlin/ }).getAttribute('href')).toBe('/trips/live');
  });

  it('hides the section when no trip is upcoming', () => {
    state.trips = [
      trip('past', 'Old trip', iso(-20), iso(-10)),
      trip('seed', 'Someday', null, null),
    ];
    state.unread = 2;
    renderModule();
    expect(screen.queryByRole('heading', { name: /Next trip/ })).toBeNull();
    expect(screen.getByRole('heading', { name: /Messages/ })).toBeTruthy();
  });

  it('empty state links to Plans and Meet', () => {
    renderModule();
    expect(screen.getByText('Nothing needs you right now.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Plans' }).getAttribute('href')).toBe('/hub/plans');
    expect(screen.getByRole('link', { name: /Meet/ }).getAttribute('href')).toBe('/meet');
  });
});
