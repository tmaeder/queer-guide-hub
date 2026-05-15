/**
 * @vitest-environment jsdom
 *
 * Covers the data-mutation surfaces of useTripCollaboration —
 * messages, notes, polls. The realtime/presence hook (useTripRealtime)
 * needs deep channel mocking and isn't covered here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };

const { state, useAuthMock } = vi.hoisted(() => ({
  state: {
    results: [] as MockResult[],
    calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
  },
  useAuthMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      const builder: unknown = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (onFulfilled: (v: MockResult) => unknown) => {
                const next = state.results.shift() ?? { data: [], error: null };
                return Promise.resolve(next).then(onFulfilled);
              };
            }
            return (...args: unknown[]) => {
              record.chain.push({ method: prop, args });
              return builder;
            };
          },
        },
      );
      return builder;
    },
    channel() {
      return {
        on() { return this; },
        subscribe() { return this; },
        presenceState() { return {}; },
        track() { return Promise.resolve(); },
        send() { return Promise.resolve(); },
      };
    },
    removeChannel() {},
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import {
  useTripMessages,
  useTripNotes,
  useTripPolls,
} from '../useTripCollaboration';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1', email: 'u1@x.com' } });
});

describe('useTripMessages', () => {
  it('is disabled when tripId is undefined', () => {
    renderHook(() => useTripMessages(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('queries trip_messages with sender join, ordered by created_at asc', async () => {
    withResults({
      data: [{ id: 'm1', trip_id: 't1', content: 'hi', sender: null }],
      error: null,
    });
    const { result } = renderHook(() => useTripMessages('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(state.calls[0].table).toBe('trip_messages');
    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['trip_id', 't1']);
    const order = state.calls[0].chain.find(s => s.method === 'order');
    expect((order?.args[1] as { ascending: boolean }).ascending).toBe(true);
  });

  it('sendMessage inserts with sender_id from user + optional reply_to', async () => {
    withResults({ data: [], error: null }, { data: { id: 'm-new' }, error: null });
    const { result } = renderHook(() => useTripMessages('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await result.current.sendMessage.mutateAsync({ content: 'hello', replyTo: 'm-prev' });

    const insertCall = state.calls.find((c, i) => i > 0 && c.chain.some(s => s.method === 'insert'));
    const payload = insertCall?.chain.find(s => s.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(payload).toEqual({
      trip_id: 't1',
      sender_id: 'u1',
      content: 'hello',
      reply_to: 'm-prev',
    });
  });

  it('sendMessage coerces missing replyTo to null', async () => {
    withResults({ data: [], error: null }, { data: { id: 'm-new' }, error: null });
    const { result } = renderHook(() => useTripMessages('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await result.current.sendMessage.mutateAsync({ content: 'hi' });

    const insertCall = state.calls.find((c, i) => i > 0 && c.chain.some(s => s.method === 'insert'));
    const payload = insertCall?.chain.find(s => s.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(payload.reply_to).toBeNull();
  });

  it('deleteMessage deletes by message id', async () => {
    withResults({ data: [], error: null }, { data: null, error: null });
    const { result } = renderHook(() => useTripMessages('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await result.current.deleteMessage.mutateAsync('m1');

    const deleteCall = state.calls.find((c, i) => i > 0);
    expect(deleteCall?.chain.some(s => s.method === 'delete')).toBe(true);
    const eq = deleteCall?.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['id', 'm1']);
  });
});

describe('useTripNotes', () => {
  it('orders pinned first, then most recently updated', async () => {
    withResults({ data: [], error: null });
    renderHook(() => useTripNotes('t1'), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const orders = state.calls[0].chain.filter(s => s.method === 'order');
    expect(orders.map(o => o.args[0])).toEqual(['is_pinned', 'updated_at']);
    expect((orders[0].args[1] as { ascending: boolean }).ascending).toBe(false);
  });

  it("createNote defaults category to 'general' when omitted", async () => {
    withResults({ data: [], error: null }, { data: { id: 'n1' }, error: null });
    const { result } = renderHook(() => useTripNotes('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await result.current.createNote.mutateAsync({ title: 'idea', content: 'body' });

    const insertCall = state.calls.find((c, i) => i > 0);
    const payload = insertCall?.chain.find(s => s.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(payload.category).toBe('general');
    expect(payload.author_id).toBe('u1');
  });

  it('updateNote stamps updated_at + filters by id', async () => {
    withResults({ data: [], error: null }, { data: { id: 'n1' }, error: null });
    const { result } = renderHook(() => useTripNotes('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await result.current.updateNote.mutateAsync({ id: 'n1', title: 'new title' });

    const updateCall = state.calls.find((c, i) => i > 0);
    const payload = updateCall?.chain.find(s => s.method === 'update')?.args[0] as Record<string, unknown>;
    expect(payload.title).toBe('new title');
    expect(typeof payload.updated_at).toBe('string');
  });

  it('togglePin flips is_pinned', async () => {
    withResults({ data: [], error: null }, { data: null, error: null });
    const { result } = renderHook(() => useTripNotes('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await result.current.togglePin.mutateAsync({ id: 'n1', isPinned: false });

    const call = state.calls.find((c, i) => i > 0);
    const update = call?.chain.find(s => s.method === 'update');
    expect(update?.args[0]).toEqual({ is_pinned: true });
  });

  it('deleteNote deletes by id', async () => {
    withResults({ data: [], error: null }, { data: null, error: null });
    const { result } = renderHook(() => useTripNotes('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await result.current.deleteNote.mutateAsync('n1');

    const call = state.calls.find((c, i) => i > 0);
    expect(call?.chain.some(s => s.method === 'delete')).toBe(true);
  });
});

describe('useTripPolls', () => {
  it('createPoll builds option objects with crypto.randomUUID ids', async () => {
    withResults({ data: [], error: null }, { data: { id: 'p1' }, error: null });
    const { result } = renderHook(() => useTripPolls('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await result.current.createPoll.mutateAsync({
      question: 'What time?',
      options: ['7pm', '8pm'],
      isMultipleChoice: true,
    });

    const call = state.calls.find((c, i) => i > 0);
    const payload = call?.chain.find(s => s.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(payload.question).toBe('What time?');
    expect(payload.is_multiple_choice).toBe(true);
    const opts = payload.options as Array<{ id: string; text: string; votes: string[] }>;
    expect(opts.map(o => o.text)).toEqual(['7pm', '8pm']);
    expect(opts.every(o => typeof o.id === 'string' && o.id.length > 0)).toBe(true);
    expect(opts.every(o => o.votes.length === 0)).toBe(true);
  });

  it('vote toggles single-choice — removes prior vote, adds new', async () => {
    // Initial useQuery: empty list.
    withResults(
      { data: [], error: null },
      // fetch poll for vote
      {
        data: {
          options: [
            { id: 'o1', text: '7pm', votes: ['u1'] },
            { id: 'o2', text: '8pm', votes: [] },
          ],
          is_multiple_choice: false,
        },
        error: null,
      },
      // update result
      { data: null, error: null },
    );

    const { result } = renderHook(() => useTripPolls('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await result.current.vote.mutateAsync({ pollId: 'p1', optionId: 'o2' });

    // Find the update call
    const updateCall = state.calls.find(c => c.chain.some(s => s.method === 'update'));
    const payload = updateCall?.chain.find(s => s.method === 'update')?.args[0] as { options: Array<{ id: string; votes: string[] }> };
    expect(payload.options.find(o => o.id === 'o1')?.votes).toEqual([]);
    expect(payload.options.find(o => o.id === 'o2')?.votes).toEqual(['u1']);
  });

  it('closePoll sets is_closed=true', async () => {
    withResults({ data: [], error: null }, { data: null, error: null });
    const { result } = renderHook(() => useTripPolls('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await result.current.closePoll.mutateAsync('p1');

    const call = state.calls.find((c, i) => i > 0);
    const update = call?.chain.find(s => s.method === 'update');
    expect(update?.args[0]).toEqual({ is_closed: true });
  });
});
