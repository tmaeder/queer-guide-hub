import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { InboxItem } from '@/hooks/useInboxFeed';
const h = vi.hoisted(() => ({
  items: [] as InboxItem[],
  error: null as Error | null,
  more: false,
  fetch: vi.fn(),
  refetch: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useInboxFeed', () => ({
  useInboxFeed: () => ({
    items: h.items,
    loading: false,
    error: h.error,
    hasNextPage: h.more,
    fetchNextPage: h.fetch,
    refetch: h.refetch,
  }),
}));
vi.mock('@/hooks/useConversationPresence', () => ({ useGlobalPresence: () => new Set() }));
vi.mock('@/hooks/useRailActions', () => ({ useRailActions: () => ({ markRead: h.read }) }));
vi.mock('@/components/messaging/VibeEditor', () => ({ VibeEditor: () => null }));
vi.mock('@/components/messaging/RecipientPicker', () => ({ RecipientPicker: () => null }));
vi.mock('@/components/inbox/ComposeEmail', () => ({ ComposeEmail: () => null }));
vi.mock('@/components/messaging/MailDetail', () => ({ MailDetail: () => null }));
vi.mock('@/components/messaging/TripEmailThread', () => ({ TripEmailThread: () => null }));
vi.mock('@/components/messaging/NotificationDetailCard', () => ({
  NotificationDetailCard: () => null,
}));
vi.mock('@/components/messaging/chat/ChatView', () => ({
  ChatView: ({ onBack }: { onBack: () => void }) => <button onClick={onBack}>Back to inbox</button>,
}));
import { MessagingInterface } from '../MessagingInterface';
const item = (id: string, kind: InboxItem['kind'], unread: boolean, subtype = 'direct') =>
  ({
    id,
    title: id,
    kind,
    unread,
    subtype,
    ts: '2026-11-24T12:00:00Z',
    preview: 'hello',
    unread_count: unread ? 1 : 0,
  }) as InboxItem;
beforeEach(() => {
  vi.clearAllMocks();
  h.error = null;
  h.more = false;
  h.items = [
    item('conv_match', 'chat', true, 'match'),
    item('conv_group', 'chat', false, 'group'),
    item('mail_1', 'mail', true),
    item('alert_1', 'notification', false),
  ];
});
function setup(filter: 'all' | 'chats' | 'matches' | 'groups' | 'alerts' = 'all', query = '') {
  return render(
    <MemoryRouter initialEntries={['/' + query]}>
      <MessagingInterface filter={filter} />
    </MemoryRouter>,
  );
}
describe('unified inbox behavior', () => {
  it('escapes the app stacking context on mobile and restores the same workspace on resize', () => {
    let mobile = true;
    const listeners = new Set<() => void>();
    const original = window.matchMedia;
    window.matchMedia = vi.fn(() => ({
      get matches() {
        return mobile;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })) as unknown as typeof window.matchMedia;
    try {
      const { container, unmount } = setup('chats');
      fireEvent.click(screen.getByText('conv_match'));
      const back = screen.getByRole('button', { name: 'Back to inbox' });
      expect(container.contains(back)).toBe(false);
      expect(document.body.contains(back)).toBe(true);
      expect(container.closest('[inert]')).not.toBeNull();
      act(() => {
        mobile = false;
        listeners.forEach((listener) => listener());
      });
      expect(container.contains(back)).toBe(true);
      expect(container.closest('[inert]')).toBeNull();
      expect(screen.getByRole('button', { name: 'Back to inbox' })).toBe(back);
      unmount();
      expect(document.body.contains(back)).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });
  it('applies Unread across message kinds and can restore all items', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.getByText('conv_match')).toBeVisible();
    expect(screen.getByText('mail_1')).toBeVisible();
    expect(screen.queryByText('conv_group')).toBeNull();
    expect(screen.queryByText('alert_1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.getByText('conv_group')).toBeVisible();
  });
  it('keeps matches and groups together under Conversations', () => {
    setup('chats');
    expect(screen.getByText('conv_match')).toBeVisible();
    expect(screen.getByText('conv_group')).toBeVisible();
    expect(screen.queryByText('mail_1')).toBeNull();
    expect(screen.queryByText('alert_1')).toBeNull();
  });
  it('keeps search hits inside the selected conversation lens', () => {
    setup('groups');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), {
      target: { value: 'hello' },
    });
    expect(screen.getByText('conv_group')).toBeVisible();
    expect(screen.queryByText('conv_match')).toBeNull();
    expect(screen.queryByText('mail_1')).toBeNull();
  });
  it('retains the detail pane when a read update removes its unread state', () => {
    const view = setup('all', '?unread=1');
    fireEvent.click(screen.getByText('conv_match'));
    expect(h.read).toHaveBeenCalledWith('match');
    h.items = h.items.map((i) => ({ ...i, unread: false }));
    view.rerender(
      <MemoryRouter>
        <MessagingInterface filter="all" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Back to inbox' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to inbox' }));
    expect(screen.getByText(/caught up/)).toBeVisible();
  });
  it('does not claim the user is caught up while older pages remain', () => {
    h.items = [];
    h.more = true;
    setup('all', '?unread=1');
    expect(screen.getByText(/loaded so far/)).toBeVisible();
    expect(screen.queryByText(/caught up/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Load older items' }));
    expect(h.fetch).toHaveBeenCalled();
  });
  it('offers retry for feed errors', () => {
    h.items = [];
    h.error = new Error('offline');
    setup();
    expect(screen.getByRole('alert')).toHaveTextContent('Messages could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(h.refetch).toHaveBeenCalled();
  });
});
