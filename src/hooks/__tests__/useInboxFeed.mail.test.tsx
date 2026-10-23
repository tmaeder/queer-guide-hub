import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
const mock = vi.hoisted(() => ({ owner: 'owner-a', mail: vi.fn(), rpc: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mock.owner } }) }));
vi.mock('@/lib/mailboxFeed', () => ({ fetchMailboxFeed: mock.mail }));
vi.mock('@/integrations/supabase/untyped', () => ({ untypedRpc: mock.rpc }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
import { useInboxFeed } from '../useInboxFeed';
import { mailboxSelection } from '@/lib/mailboxSelection';
let client: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mock.owner = 'owner-a';
  mock.mail.mockReset();
  mock.rpc.mockReset().mockResolvedValue({ data: 0, error: null });
});
afterEach(() => {
  cleanup();
  client.clear();
});
it('pages received/Sent metadata by the final exact cursor while preserving the incoming unread RPC', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({
    ...mailboxSelection(`88888888-0000-4000-8000-${String(i + 100).padStart(12, '0')}`)!,
    ts: '2026-10-24T12:00:00.123456+00:00',
  }));
  mock.mail
    .mockResolvedValueOnce(rows)
    .mockResolvedValueOnce([{ ...rows[0], id: 'mail_88888888-0000-4000-8000-000000000999' }]);
  const { result } = renderHook(() => useInboxFeed('mail'), { wrapper });
  await waitFor(() => expect(result.current.items).toHaveLength(30));
  expect(result.current.hasNextPage).toBe(true);
  await act(async () => {
    await result.current.fetchNextPage();
  });
  await waitFor(() => expect(result.current.items).toHaveLength(31));
  expect(mock.mail.mock.calls[1][0]).toBe('owner-a');
  expect(mock.mail.mock.calls[1][1]).toEqual({ ts: rows[29].ts, id: rows[29].id });
  expect(result.current.hasNextPage).toBe(false);
  expect(mock.rpc.mock.calls.every((call) => call[0] === 'get_inbox_unread_count')).toBe(true);
});
it('aborts and discards a previous account page if it resolves after an account switch', async () => {
  let finish: (rows: unknown[]) => void = () => {};
  let signal: AbortSignal | undefined;
  mock.mail
    .mockImplementationOnce((_owner: string, _cursor: unknown, s: AbortSignal) => {
      signal = s;
      return new Promise((resolve) => {
        finish = resolve;
      });
    })
    .mockResolvedValue([
      { ...mailboxSelection('88888888-0000-4000-8000-000000000999')!, title: 'New account mail' },
    ]);
  const { result, rerender } = renderHook(() => useInboxFeed('mail'), { wrapper });
  await waitFor(() => expect(mock.mail).toHaveBeenCalledOnce());
  mock.owner = 'owner-b';
  rerender();
  await waitFor(() => expect(result.current.items[0]?.title).toBe('New account mail'));
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish([
      { ...mailboxSelection('88888888-0000-4000-8000-000000000111')!, title: 'Old account mail' },
    ]);
  });
  expect(result.current.items.map((item) => item.title)).toEqual(['New account mail']);
});
