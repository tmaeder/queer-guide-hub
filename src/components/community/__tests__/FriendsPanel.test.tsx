/**
 * @vitest-environment jsdom
 *
 * The friends list used to render its "no friends yet" empty state in three
 * different situations: before the first fetch settled, after a failed fetch,
 * and when the user genuinely had no friends. A user with a pending request
 * they had SENT also saw nothing at all, because outgoing requests were not
 * rendered anywhere. These tests pin each state apart.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const ME = 'me';
const OTHER = 'other';

type Rel = {
  id: string;
  user_id: string;
  target_user_id: string;
  relationship_type: 'friend';
  status: 'pending' | 'accepted';
};

let state: {
  hasLoaded: boolean;
  error: string | null;
  friends: Rel[];
  received: Rel[];
  sent: Rel[];
};
const refetch = vi.fn();
const removeRelationship = vi.fn();

vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/hooks/useSOS', () => ({
  useSOS: () => ({
    sendSOS: vi.fn(),
    canSend: false,
    loading: false,
    cooldownSeconds: 0,
    friendCount: 0,
  }),
}));
vi.mock('@/hooks/usePageFetchers', () => ({
  fetchProfilesByUserIds: vi
    .fn()
    .mockResolvedValue([
      { user_id: 'other', display_name: 'Robin', avatar_url: null, location: null },
    ]),
}));
vi.mock('@/pages/people/PeopleModeView', () => ({ PeopleModeView: () => null }));
vi.mock('@/components/people/MeetMembersNotice', () => ({ MeetMembersNotice: () => null }));
vi.mock('@/components/messaging/StartConversationButton', () => ({
  StartConversationButton: () => null,
}));
vi.mock('@/hooks/useUserRelationships', () => ({
  useUserRelationships: () => ({
    acceptFriendRequest: vi.fn(),
    rejectFriendRequest: vi.fn(),
    removeRelationship,
    getFriends: () => state.friends,
    getPendingRequests: () => state.received,
    getSentRequests: () => state.sent,
    loading: false,
    hasLoaded: state.hasLoaded,
    error: state.error,
    refetch,
  }),
}));

import { FriendsPanel } from '../FriendsPanel';

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return render(<FriendsPanel />, { wrapper });
}

const sentRequest: Rel = {
  id: 'r1',
  user_id: ME,
  target_user_id: OTHER,
  relationship_type: 'friend',
  status: 'pending',
};

beforeEach(() => {
  state = { hasLoaded: true, error: null, friends: [], received: [], sent: [] };
  refetch.mockReset();
  removeRelationship.mockReset();
});

describe('FriendsPanel', () => {
  it('shows a loading state, not the empty state, before the first fetch settles', () => {
    state.hasLoaded = false;
    renderPanel();
    expect(screen.queryByText('No friends yet.')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('shows an error with retry, not the empty state, when the fetch failed', () => {
    state.error = 'network down';
    renderPanel();
    expect(screen.queryByText('No friends yet.')).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state only once the fetch succeeded with no friends', () => {
    renderPanel();
    expect(screen.getByText('No friends yet.')).toBeTruthy();
  });

  it('points to the requests tab when the user has sent requests waiting', () => {
    state.sent = [sentRequest];
    renderPanel();
    expect(screen.getByText(/See the Requests tab/)).toBeTruthy();
  });

  it('counts sent requests in the Requests tab and lists them with a withdraw action', async () => {
    state.sent = [sentRequest];
    renderPanel();
    const tab = screen.getByRole('tab', { name: /Requests \(1\)/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(await screen.findByText('Robin')).toBeTruthy();
    expect(screen.getByText('Waiting for an answer')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(removeRelationship).toHaveBeenCalledWith(OTHER);
  });
});
