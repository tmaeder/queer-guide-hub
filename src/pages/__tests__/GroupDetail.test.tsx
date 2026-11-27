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
  posts: [] as Array<{ id: string }>,
}));

vi.mock('@/hooks/useGroups', () => ({ useGroups: hooks.groups }));
vi.mock('@/hooks/useGroupPosts', () => ({
  useGroupPosts: () => ({ posts: hooks.posts, groupMembers: [], isLoading: false }),
}));
vi.mock('@/components/groups/GroupPostCard', () => ({
  GroupPostCard: ({ post }: { post: { id: string } }) => <article>{post.id}</article>,
}));
vi.mock('@/hooks/useGroupEvents', () => ({
  useGroupEvents: hooks.events,
  usePublicGroupMeetup: hooks.publicMeetup,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: hooks.auth }));
vi.mock('@/hooks/useGroupCollections', () => ({
  useGroupCollections: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/components/groups/GroupCollections', () => ({ GroupCollections: () => null }));
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

function renderDetail(path = '/meet/groups/g1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/meet/groups/:groupId" element={<GroupDetail />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('GroupDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.posts = [];
    hooks.auth.mockReturnValue({ user: { id: 'u1' } });
    hooks.groups.mockReturnValue({
      groups: [publicGroup],
      userGroups: [],
      isLoading: false,
      joinGroup: hooks.join,
      requestJoin: hooks.requestJoin,
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
    expect(screen.getByRole('link', { name: 'Meetup details' }).getAttribute('href')).toBe(
      '/events/reading-night',
    );
    expect(screen.getByRole('link', { name: 'Sign in to join' }).getAttribute('href')).toBe(
      '/auth?redirect=%2Fmeet%2Fgroups%2Fg1',
    );
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('keeps a private group behind sign-in for guests', () => {
    hooks.auth.mockReturnValue({ user: null });
    hooks.groups.mockReturnValue({
      groups: [{ ...publicGroup, is_private: true }],
      userGroups: [],
    });
    renderDetail();
    expect(screen.queryByText(publicGroup.description)).toBeNull();
    expect(hooks.publicMeetup).toHaveBeenCalledWith('g1', false);
  });

  it('uses the request flow and leaves private meetups out of the preview for nonmembers', () => {
    hooks.groups.mockReturnValue({
      groups: [{ ...publicGroup, is_private: true }],
      userGroups: [],
      requestJoin: hooks.requestJoin,
    });
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Request to join' }));
    expect(hooks.requestJoin).toHaveBeenCalledWith({ groupId: 'g1' });
    expect(hooks.events).toHaveBeenCalledWith('');
    // No empty "Next meetup" box; the privacy note says why there is nothing.
    expect(screen.queryByRole('heading', { name: 'Next meetup' })).toBeNull();
    expect(
      screen.getByText(
        'Only the organisers can see who is a member. Posts, meetups and chat are for members.',
      ),
    ).toBeTruthy();
    // RLS hides a private group's member list from non-organisers, so the page
    // does not claim "no organisers".
    expect(screen.queryByText('No organisers are listed.')).toBeNull();
  });

  it('explains a public group before the join button and hides empty optional tabs', () => {
    hooks.groups.mockReturnValue({
      groups: [{ ...publicGroup, rules: 'Be kind.', last_activity_at: '2025-07-14T18:19:26Z' }],
      userGroups: [],
      joinGroup: hooks.join,
    });
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Before you join' })).toBeTruthy();
    expect(screen.getByText('Be kind.')).toBeTruthy();
    expect(
      screen.getByText('Anyone can see that you are a member. Posts and chat are for members.'),
    ).toBeTruthy();
    expect(screen.getByText('No organisers are listed.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Next meetup' })).toBeNull();
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['About', 'Members12']);
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

  it('opens the post a notification links to', () => {
    hooks.posts = [{ id: 'p1' }, { id: 'p2' }];
    hooks.groups.mockReturnValue({
      groups: [{ ...publicGroup, is_member: true }],
      userGroups: [],
      isLoading: false,
    });
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = function (this: Element) {
      scroll(this.id);
    };
    renderDetail('/meet/groups/g1?post=p2');
    expect(screen.getByRole('tab', { name: /Posts/ })).toHaveAttribute('aria-selected', 'true');
    expect(scroll).toHaveBeenCalledWith('group-post-p2');
  });
});
