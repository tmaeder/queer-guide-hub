import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  send: vi.fn(),
  edit: vi.fn(),
  upload: vi.fn(),
  read: vi.fn().mockResolvedValue(undefined),
  noop: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useMessaging', () => ({
  useMessaging: () => ({
    conversations: [{ id: 'c1', conversation_type: 'direct', participants: [] }],
    messages: {
      c1: [
        {
          id: 'm1',
          sender_id: 'u2',
          content: 'Original',
          created_at: '2026-11-24T12:00:00Z',
          sender: { display_name: 'Alex' },
        },
      ],
    },
    typingUsers: {},
    hasMore: {},
    loadingOlder: {},
    fetchMessages: h.noop,
    markAsRead: h.read,
    fetchOlderMessages: h.noop,
    sendMessage: h.send,
    editMessage: h.edit,
    stopTypingIndicator: h.noop,
    sendTypingIndicator: h.noop,
  }),
}));
vi.mock('@/hooks/useChatImageUpload', () => ({
  useChatImageUpload: () => ({ upload: h.upload, uploading: false }),
}));
vi.mock('@/hooks/useConversationPresence', () => ({ useConversationPresence: () => new Set() }));
vi.mock('@/hooks/useConversationAvailability', () => ({ useConversationAvailability: () => ({}) }));
vi.mock('@/hooks/usePublicStatus', () => ({ usePublicStatus: () => ({ status: null }) }));
vi.mock('../useJoyBurstTrigger', () => ({ useJoyBurstTrigger: () => ({ joy: false }) }));
vi.mock('../useMessageListScroll', () => ({
  useMessageListScroll: () => ({
    inputRef: { current: null },
    scrollRootRef: { current: null },
    messagesEndRef: { current: null },
  }),
}));
vi.mock('../InChatSubmitSheet', () => ({ InChatSubmitSheet: () => null }));
vi.mock('../MessageItem', () => ({
  MessageItem: ({
    message,
    onReply,
    onEdit,
  }: {
    message: never;
    onReply: (m: never) => void;
    onEdit: (m: never) => void;
  }) => (
    <>
      <button onClick={() => onReply(message)}>Reply</button>
      <button onClick={() => onEdit(message)}>Edit</button>
    </>
  ),
}));
vi.mock('@/components/messaging/EmojiPicker', () => ({ EmojiPicker: () => null }));
vi.mock('@/components/messaging/StickerPicker', () => ({ StickerPicker: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; name?: string }) =>
      (options?.defaultValue ?? key).replace('{{name}}', options?.name ?? ''),
  }),
}));
import { ChatView } from '../ChatView';
function setup() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ChatView conversationId="c1" onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  h.send.mockResolvedValue(undefined);
  h.edit.mockResolvedValue(false);
});
describe('chat send outcomes', () => {
  it('keeps reply context, caption and private image when sending fails, then clears them after retry', async () => {
    h.upload.mockResolvedValue({
      url: '/photo.webp',
      objectId: 'object',
      bucket: 'chat-private',
      path: 'u1/photo.webp',
      width: 100,
      height: 100,
    });
    const view = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.change(view.container.querySelector('input[type=file]')!, {
      target: { files: [new File(['image'], 'photo.png', { type: 'image/png' })] },
    });
    await screen.findByRole('button', { name: 'Remove image' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'My caption' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Replying to Alex')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('My caption');
    expect(screen.getByRole('button', { name: 'Remove image' })).toBeVisible();
    h.send.mockResolvedValue({ id: 'sent' });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull());
    expect(screen.queryByText('Replying to Alex')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
    expect(h.send).toHaveBeenNthCalledWith(2, 'c1', 'My caption', 'm1', 'image', undefined, [
      expect.objectContaining({ path: 'u1/photo.webp' }),
    ]);
  });
  it('keeps an unsuccessful edit open without overwriting the conversation draft', async () => {
    setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Unsent draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Edited text' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Editing message')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Edited text');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Unsent draft');
  });
});
