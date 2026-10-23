import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import type { InboxItem } from '@/hooks/useInboxFeed';
const mocks = vi.hoisted(() => ({
  user: { id: 'owner-a' },
  send: vi.fn(),
  read: vi.fn(),
  more: vi.fn(),
  reload: vi.fn(),
  receipt: vi.fn(),
  markRead: vi.fn(),
  move: vi.fn(),
  feed: {
    items: [] as InboxItem[],
    loading: false,
    error: null as Error | null,
    hasNextPage: false,
    isFetchingNextPage: false,
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/hooks/useInboxFeed', () => ({
  useInboxFeed: () => ({ ...mocks.feed, fetchNextPage: mocks.more, refetch: mocks.reload }),
}));
vi.mock('@/hooks/useMailbox', () => ({
  useMailbox: () => ({
    sendEmail: mocks.send,
    sending: false,
    fetchEmailById: mocks.read,
    markRead: mocks.markRead,
    moveToFolder: mocks.move,
  }),
}));
vi.mock('@/hooks/useMailboxAddress', () => ({
  useMailboxAddress: () => ({ fullEmail: 'owner@example.invalid' }),
}));
vi.mock('@/hooks/useMailboxDelivery', () => ({
  useMailboxDelivery: () => ({
    enabled: true,
    data: 'accepted',
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: mocks.receipt,
  }),
}));
vi.mock('@/hooks/useConversationPresence', () => ({ useGlobalPresence: () => new Set() }));
vi.mock('@/hooks/useRailActions', () => ({ useRailActions: () => ({}) }));
vi.mock('@/components/messaging/VibeEditor', () => ({ VibeEditor: () => <span>Messages</span> }));
vi.mock('@/components/messaging/ComposeChooser', () => ({
  ComposeChooser: ({ onNewEmail }: { onNewEmail: () => void }) => (
    <button onClick={onNewEmail}>New email</button>
  ),
}));
vi.mock('@/components/messaging/RecipientPicker', () => ({ RecipientPicker: () => null }));
vi.mock('@/components/messaging/chat/ChatView', () => ({ ChatView: () => null }));
vi.mock('@/components/messaging/TripEmailThread', () => ({ TripEmailThread: () => null }));
vi.mock('@/components/messaging/NotificationDetailCard', () => ({
  NotificationDetailCard: () => null,
}));
vi.mock('@/components/cms/editor/RichTextEditor', () => ({
  RichTextEditor: () => <div>Message editor</div>,
}));
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock('react-i18next', async () => {
  const { default: en } = await import('@/i18n/locales/en.json');
  return {
    useTranslation: () => ({
      t: (key: string, options?: string | Record<string, unknown>) => {
        let value: unknown = en;
        for (const part of key.split('.'))
          value =
            value && typeof value === 'object'
              ? (value as Record<string, unknown>)[part]
              : undefined;
        return typeof value === 'string'
          ? value.replace(/{{(\w+)}}/g, (_match, key: string) =>
              typeof options === 'object' ? String(options[key] ?? '') : '',
            )
          : typeof options === 'string'
            ? options
            : (options?.defaultValue ?? key);
      },
    }),
  };
});
import { MessagingInterface } from '../MessagingInterface';
import { mailboxSelection } from '@/lib/mailboxSelection';
const first = '88888888-0000-4000-8000-000000000030',
  saved = '88888888-0000-4000-8000-000000000031';
function Location() {
  return <output data-testid="location">{useLocation().search}</output>;
}
function mount(path = '/messages') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MessagingInterface filter="mail" />
      <Location />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  mocks.send.mockReset().mockResolvedValue({ email_id: saved });
  mocks.more.mockReset();
  mocks.reload.mockReset();
  mocks.receipt.mockReset();
  mocks.read.mockReset().mockImplementation(async (id: string) => ({
    id,
    owner_id: 'owner-a',
    direction: 'outbound',
    status: 'accepted',
    from_address: 'owner@example.invalid',
    to_address: 'organisation@example.invalid',
    subject: id === saved ? 'Canonical saved copy' : 'Original sent message',
    body_text: 'Synthetic requested information',
    body_html: null,
    attachments: [],
    email_date: '2026-10-23T12:00:00Z',
    is_read: true,
  }));
  mocks.feed = {
    items: [],
    loading: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
  };
});
afterEach(cleanup);
it('opens the canonical saved copy after compose even before it appears in the rail', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'New email' }));
  fireEvent.change(screen.getByPlaceholderText('recipient@example.com'), {
    target: { value: 'organisation@example.invalid' },
  });
  fireEvent.change(screen.getByPlaceholderText('Email subject'), {
    target: { value: 'Requested information' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(`email=${saved}`));
  expect(await screen.findByText('Canonical saved copy')).toBeVisible();
  expect(screen.getByText('Delivery: Submitted')).toBeVisible();
  expect(mocks.read).toHaveBeenCalledWith(saved);
});
it('replies to the recipient of outgoing mail and follows the new saved copy', async () => {
  mount(`/messages?email=${first}`);
  await screen.findByText('Original sent message');
  fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
  fireEvent.change(screen.getByPlaceholderText('Write your reply…'), {
    target: { value: 'Requested follow-up' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() =>
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'organisation@example.invalid',
        in_reply_to_email_id: first,
        body_text: 'Requested follow-up',
      }),
    ),
  );
  expect(await screen.findByText('Canonical saved copy')).toBeVisible();
  expect(screen.getByTestId('location')).toHaveTextContent(`email=${saved}`);
});
it('makes Sent mail discoverable and keeps older pages reachable when search has no current match', () => {
  mocks.feed.items = [
    {
      ...mailboxSelection(first)!,
      subtype: 'outbound',
      title: 'Requested information',
      preview: 'Sent fixture',
      ts: '2026-10-23T12:00:00Z',
    },
  ];
  mocks.feed.hasNextPage = true;
  mount();
  expect(screen.getByText('Received and sent mail')).toBeVisible();
  expect(screen.getByText('Sent: Sent fixture')).toBeVisible();
  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'older message' } });
  expect(screen.getByText('No matches.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Load More' }));
  expect(mocks.more).toHaveBeenCalledOnce();
  expect(mocks.send).not.toHaveBeenCalled();
});
it('shows read failures with a read-only retry rather than an empty mailbox', () => {
  mocks.feed.error = new Error('Synthetic offline');
  mount();
  expect(screen.getByRole('alert')).toHaveTextContent('Messages could not load');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(mocks.reload).toHaveBeenCalledOnce();
  expect(mocks.send).not.toHaveBeenCalled();
});
