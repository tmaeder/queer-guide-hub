import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// All network calls hang (never resolve) so the mutation stays pending and the
// optimistic cache patch from onMutate is observable without being reconciled
// or rolled back by a server response.
vi.mock('@/integrations/supabase/client', () => {
  const never = new Promise(() => {});
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'range', 'eq', 'in', 'delete']) {
    chain[m] = () => chain;
  }
  chain.insert = () => never;
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
    (never as Promise<unknown>).then(onFulfilled, onRejected);
  const channel: Record<string, unknown> = {};
  channel.on = () => channel;
  channel.subscribe = () => channel;
  return {
    supabase: {
      from: () => chain,
      rpc: () => never,
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

import { useCommunityPosts } from '../useCommunityPosts';

const POST_KEY = ['community-posts', null, 'user-1'];

const seedPost = (qc: QueryClient) =>
  qc.setQueryData(POST_KEY, {
    pages: [
      {
        posts: [
          { id: 'post-1', user_liked: false, likes_count: 2, content: 'hi', user_id: 'u2' },
        ],
        nextPage: null,
      },
    ],
    pageParams: [0],
  });

describe('useCommunityPosts optimistic like', () => {
  const render = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    seedPost(qc);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCommunityPosts(), { wrapper });
    return { qc, result };
  };

  it('flips user_liked + likes_count optimistically before the request settles', async () => {
    const { result } = render();
    expect(result.current.posts[0]).toMatchObject({ user_liked: false, likes_count: 2 });

    act(() => result.current.likePost('post-1'));

    await waitFor(() =>
      expect(result.current.posts[0]).toMatchObject({ user_liked: true, likes_count: 3 }),
    );
  });

  it('decrements optimistically on unlike', async () => {
    const { qc, result } = render();
    qc.setQueryData(POST_KEY, {
      pages: [
        {
          posts: [
            { id: 'post-1', user_liked: true, likes_count: 3, content: 'hi', user_id: 'u2' },
          ],
          nextPage: null,
        },
      ],
      pageParams: [0],
    });

    act(() => result.current.unlikePost('post-1'));

    await waitFor(() =>
      expect(result.current.posts[0]).toMatchObject({ user_liked: false, likes_count: 2 }),
    );
  });
});
