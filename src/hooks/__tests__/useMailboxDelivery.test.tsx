import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
import type { MailboxEmail } from '../useMailbox';
const mocks = vi.hoisted(() => ({
  owner: 'owner-a',
  session: 'owner-a',
  fetch: vi.fn(),
  updates: [] as (() => void)[],
  connects: [] as ((status: string) => void)[],
  filters: [] as unknown[],
  removed: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: mocks.owner } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://fixture.invalid',
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'fixture-token', user: { id: mocks.session } } },
      }),
    },
    channel: () => {
      const channel = {
        on: (_event: string, filter: unknown, callback: () => void) => {
          mocks.filters.push(filter);
          mocks.updates.push(callback);
          return channel;
        },
        subscribe: (callback: (status: string) => void) => {
          mocks.connects.push(callback);
          return channel;
        },
      };
      return channel;
    },
    removeChannel: mocks.removed,
  },
}));
import { fetchMailboxDelivery, useMailboxDelivery } from '../useMailboxDelivery';
let client: QueryClient;
const email = {
  id: 'copy-a',
  owner_id: 'owner-a',
  direction: 'outbound',
  status: 'accepted',
} as MailboxEmail;
const receipt = (status: string | null) =>
  new Response(JSON.stringify({ delivery_status: status }));
const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.owner = mocks.session = 'owner-a';
  mocks.fetch.mockReset();
  mocks.removed.mockReset();
  mocks.updates.length = mocks.connects.length = mocks.filters.length = 0;
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('reads canonical receipts with GET and invalidates on a copy update and reconnect', async () => {
  let status = 'accepted';
  mocks.fetch.mockImplementation(async () => receipt(status));
  const { result, unmount } = renderHook(() => useMailboxDelivery(email), { wrapper });
  await waitFor(() => expect(result.current.data).toBe('accepted'));
  expect(mocks.fetch.mock.calls[0][1].method).toBe('GET');
  expect(mocks.filters[0]).toEqual({
    event: 'UPDATE',
    schema: 'public',
    table: 'mailbox_emails',
    filter: 'id=eq.copy-a',
  });
  status = 'delivered';
  act(() => mocks.updates[0]());
  await waitFor(() => expect(result.current.data).toBe('delivered'));
  status = 'complained';
  act(() => mocks.connects[0]('SUBSCRIBED'));
  await waitFor(() => expect(result.current.data).toBe('complained'));
  unmount();
  const count = mocks.fetch.mock.calls.length;
  act(() => mocks.updates[0]());
  expect(mocks.fetch).toHaveBeenCalledTimes(count);
  expect(mocks.removed).toHaveBeenCalledOnce();
});
it('retains the last verified receipt on refresh failure and recovers without sending', async () => {
  mocks.fetch.mockImplementation(async () => receipt('accepted'));
  const { result } = renderHook(() => useMailboxDelivery(email), { wrapper });
  await waitFor(() => expect(result.current.data).toBe('accepted'));
  mocks.fetch.mockImplementation(async () => new Response('', { status: 503 }));
  act(() => mocks.updates[0]());
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBe('accepted');
  mocks.fetch.mockImplementation(async () => receipt('delivered'));
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => expect(result.current.data).toBe('delivered'));
  expect(result.current.isError).toBe(false);
  expect(mocks.fetch.mock.calls.every((call) => call[1].method === 'GET')).toBe(true);
});
it('does not request outgoing receipts for inbound, draft or foreign copies', () => {
  for (const changed of [{ direction: 'inbound' }, { status: 'draft' }, { owner_id: 'other' }]) {
    const { result, unmount } = renderHook(
      () => useMailboxDelivery({ ...email, ...changed } as MailboxEmail),
      { wrapper },
    );
    expect(result.current.enabled).toBe(false);
    unmount();
  }
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.filters).toEqual([]);
});
it('rejects changed sessions and malformed receipts before showing a delivery claim', async () => {
  mocks.session = 'other';
  await expect(
    fetchMailboxDelivery(email.id, email.owner_id, new AbortController().signal),
  ).rejects.toThrow('session changed');
  expect(mocks.fetch).not.toHaveBeenCalled();
  mocks.session = mocks.owner;
  for (const body of [{ delivery_status: 'sent' }, {}, { delivery_status: 1 }]) {
    mocks.fetch.mockImplementation(async () => new Response(JSON.stringify(body)));
    await expect(
      fetchMailboxDelivery(email.id, email.owner_id, new AbortController().signal),
    ).rejects.toThrow('Invalid mailbox receipt');
  }
});
it('aborts the previous copy read and ignores its late response after selection changes', async () => {
  let finish: (response: Response) => void = () => {};
  let oldSignal: AbortSignal | undefined;
  mocks.fetch
    .mockImplementationOnce((_url: string, options: { signal: AbortSignal }) => {
      oldSignal = options.signal;
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    })
    .mockImplementation(async () => receipt('delivered'));
  const { result, rerender } = renderHook(({ selected }) => useMailboxDelivery(selected), {
    wrapper,
    initialProps: { selected: email },
  });
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
  rerender({ selected: { ...email, id: 'copy-b' } });
  await waitFor(() => expect(result.current.data).toBe('delivered'));
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => {
    finish(receipt('accepted'));
  });
  expect(result.current.data).toBe('delivered');
  expect(mocks.removed).toHaveBeenCalledOnce();
});
it('hides previous-account receipts immediately when the account changes', async () => {
  mocks.fetch.mockImplementation(async () => receipt('accepted'));
  const { result, rerender } = renderHook(() => useMailboxDelivery(email), { wrapper });
  await waitFor(() => expect(result.current.data).toBe('accepted'));
  mocks.owner = mocks.session = 'owner-b';
  rerender();
  expect(result.current.enabled).toBe(false);
  expect(result.current.data).toBeUndefined();
  expect(mocks.removed).toHaveBeenCalledOnce();
});
it('polls only while a proven message is pending and stops after delivery', async () => {
  vi.useFakeTimers();
  let status = 'accepted';
  mocks.fetch.mockImplementation(async () => receipt(status));
  const { result } = renderHook(() => useMailboxDelivery(email), { wrapper });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(result.current.data).toBe('accepted');
  status = 'delivered';
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_010);
  });
  expect(result.current.data).toBe('delivered');
  const count = mocks.fetch.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(mocks.fetch).toHaveBeenCalledTimes(count);
});
