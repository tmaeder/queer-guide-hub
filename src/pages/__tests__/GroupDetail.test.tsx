/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const hooks = vi.hoisted(() => ({
  auth: vi.fn(),
  groups: vi.fn(),
  events: vi.fn(),
  publicMeetup: vi.fn(),
  join: vi.fn(),
  requestJoin: vi.fn(),
}));

vi.mock('@/hooks/useGroups', () => ({ useGroups: hooks.groups }));
vi.mock('@/hooks/useGroupPosts', () => ({
  useGroupPosts: () => ({ posts: [], groupMembers: [], isLoading: false }),
}));
vi.mock('@/hooks/useGroupEvents', () => ({
  useGroupEvents: hooks.events,
  usePublicGroupMeetup: hooks.publicMeetup,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: hooks.auth }));
vi.mock('@/components/admin/inline/Editable', () => ({
  Editable: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/admin/AdminEditButton', () => ({ AdminEditButton: () => null }));
vi.mock('@/components/hub/HubNavBar', () => ({ HubNavBar: () => null }));

import GroupDetail from '../GroupDetail';

const publicGroup = {
  id: 'g1',
  name: 'Queer Book Club',
  description: 'A monthly gathering for queer readers.',
  created_at: '2024-01-01',
  member_count: 12,
  is_private: false,
  is_member: false,
};
const event = {
  id: 'e1',
  slug: 'reading-night',
  title: 'Reading night',
  start_date: '2099-06-01T17:00:00Z',
  city: 'Zürich',
  timezone: 'Europe/Zurich',
  liveness_status: 'live',
};

function renderDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={['/hub/groups/g1']}>
      <QueryClientProvider client={queryClient}>
        <Routes><Route path="/hub/groups/:groupId" element={<GroupDetail />} /></Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('GroupDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.auth.mockReturnValue({ user: { id: 'u1' } });
    hooks.groups.mockReturnValue({
      groups: [publicGroup], userGroups: [], isLoading: false,
      joinGroup: hooks.join, requestJoin: hooks.requestJoin,
    });
    hooks.events.mockReturnValue({ events: [], isLoading: false });
    hooks.publicMeetup.mockReturnValue({ data: null, isLoading: false });
  });

  it('shows a public preview with a meetup and a return path after sign-in', () => {
    hooks.auth.mockReturnValue({ user: null });
    hooks.publicMeetup.mockReturnValue({ data: event, isLoading: false });
    renderDetail();
    expect(screen.getByRole('heading', { name: publicGroup.name })).toBeTruthy();
    expect(screen.getByText(publicGroup.description)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Meetup details' }).getAttribute('href')).toBe('/events/reading-night');
    expect(screen.getByRole('link', { name: 'Sign in to join' }).getAttribute('href')).toBe('/auth?redirect=%2Fhub%2Fgroups%2Fg1');
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('keeps a private group behind sign-in for guests', () => {
    hooks.auth.mockReturnValue({ user: null });
    hooks.groups.mockReturnValue({ groups: [{ ...publicGroup, is_private: true }], userGroups: [] });
    renderDetail();
    expect(screen.queryByText(publicGroup.description)).toBeNull();
    expect(hooks.publicMeetup).toHaveBeenCalledWith('g1', false);
  });

  it('uses the request flow and leaves private meetups out of the preview for nonmembers', () => {
    hooks.groups.mockReturnValue({
      groups: [{ ...publicGroup, is_private: true }], userGroups: [], requestJoin: hooks.requestJoin,
    });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Request to join' }));
    expect(hooks.requestJoin).toHaveBeenCalledWith({ groupId: 'g1' });
    expect(hooks.events).toHaveBeenCalledWith('');
    expect(screen.getByText('Meetups are visible to group members.')).toBeTruthy();
  });

  it('leads with the upcoming meetup and keeps direct join available for a public group', () => {
    hooks.events.mockReturnValue({
      events: [
        { ...event, id: 'past', title: 'Past meetup', start_date: '2024-01-01T12:00:00Z' },
        { ...event, id: 'cancelled', title: 'Cancelled meetup', liveness_status: 'cancelled' },
        event,
      ],
    });
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Reading night' })).toBeTruthy();
    expect(screen.queryByText('Past meetup')).toBeNull();
    expect(screen.queryByText('Cancelled meetup')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Join group' }));
    expect(hooks.join).toHaveBeenCalledWith('g1');
  });
});
