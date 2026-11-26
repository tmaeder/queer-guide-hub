import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  createPost: vi.fn(),
  sendMessage: vi.fn(async () => ({ id: 'm1' })),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/useCommunityPosts', () => ({
  useCommunityPosts: () => ({
    posts: [],
    isLoading: false,
    createPost: h.createPost,
    isCreatingPost: false,
  }),
}));
vi.mock('@/components/security/EnhancedFormValidator', () => ({
  useFormValidation: () => ({ validateFormData: async () => ({ isValid: true, errors: [] }) }),
}));
vi.mock('@/hooks/useInboxFeed', () => ({ useInboxFeed: () => ({ items: [], loading: false }) }));
vi.mock('@/hooks/useMessaging', () => ({ useMessaging: () => ({ sendMessage: h.sendMessage }) }));
// The picker's own search is covered elsewhere; here it picks one person.
vi.mock('@/components/messaging/RecipientPicker', () => ({
  RecipientPicker: ({ onPicked }: { onPicked: (id: string, p: object) => void }) => (
    <button
      type="button"
      onClick={() => onPicked('conv-1', { user_id: 'u-2', display_name: 'Alex', avatar_url: null })}
    >
      pick Alex
    </button>
  ),
}));

import { FeedPeek } from '../HubPeeks';
import { MessagesPeek } from '@/components/notifications/MessagesPeek';

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('composing inside the Hub menu', () => {
  beforeEach(() => {
    h.createPost.mockReset();
    h.sendMessage.mockClear();
  });

  it('Feed: posts a public text post with its #tags, without leaving the menu', async () => {
    wrap(<FeedPeek onNavigate={() => {}} openLabel="Feed" />);
    const post = screen.getByRole('button', { name: 'Post' });
    expect(post).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox'), 'Pride brunch tomorrow #zurich');
    await userEvent.click(post);
    await waitFor(() => expect(h.createPost).toHaveBeenCalledTimes(1));
    expect(h.createPost.mock.calls[0][0]).toMatchObject({
      content: 'Pride brunch tomorrow #zurich',
      post_type: 'text',
      visibility: 'public',
      tags: ['zurich'],
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('New message: pick a person, write, send, back to the list', async () => {
    wrap(<MessagesPeek onNavigate={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /new message/i }));
    await userEvent.click(screen.getByRole('button', { name: 'pick Alex' }));
    expect(screen.getByText('Alex')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'Hi!');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(h.sendMessage).toHaveBeenCalledWith('conv-1', 'Hi!'));
    expect(await screen.findByRole('button', { name: /new message/i })).toBeInTheDocument();
  });
});
