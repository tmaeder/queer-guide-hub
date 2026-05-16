/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };
const { state, useAuthMock } = vi.hoisted(() => ({
  state: {
    results: [] as MockResult[],
    calls: [] as Array<{ rpc: string; chain: Array<{ method: string; args: unknown[] }> }>,
  },
  useAuthMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc(name: string, args: unknown) {
      state.calls.push({ rpc: name, chain: [{ method: 'rpc', args: [name, args] }] });
      const next = state.results.shift() ?? { data: null, error: null };
      return Promise.resolve(next);
    },
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import { useUnifiedTriageQueue, useTriageAction } from '../useUnifiedTriageQueue';

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
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
});

describe('useUnifiedTriageQueue', () => {
  it('calls get_unified_triage_queue RPC with all filter args', async () => {
    withResults({ data: { items: [{ id: 'i1' }], total: 1, page: 1, per_page: 25 }, error: null });

    const { result } = renderHook(
      () =>
        useUnifiedTriageQueue({
          queueTypes: ['staging'],
          contentTypes: ['venue'],
          search: 'berghain',
          sort: 'confidence',
          page: 2,
          perPage: 10,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args).toEqual({
      p_queue_types: ['staging'],
      p_content_types: ['venue'],
      p_search: 'berghain',
      p_sort: 'confidence',
      p_page: 2,
      p_per_page: 10,
    });
  });

  it('coerces empty search to null', async () => {
    withResults({ data: { items: [], total: 0, page: 1, per_page: 25 }, error: null });
    renderHook(
      () =>
        useUnifiedTriageQueue({
          queueTypes: null, contentTypes: null, search: '', sort: 'age', page: 1, perPage: 25,
        }),
      { wrapper },
    );
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args.p_search).toBeNull();
  });
});

describe('useTriageAction', () => {
  it('calls triage_action RPC with current user + defaults', async () => {
    withResults({ data: { ok: true }, error: null });
    const { result } = renderHook(() => useTriageAction(), { wrapper });
    await result.current.mutateAsync({ itemId: 'i1', queueType: 'staging', action: 'approve' });

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args).toMatchObject({
      p_item_id: 'i1',
      p_queue_type: 'staging',
      p_action: 'approve',
      p_user_id: 'u1',
      p_notes: null,
      p_canned_slug: null,
      p_notify: true,
    });
  });

  it('honors notify=false override', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useTriageAction(), { wrapper });
    await result.current.mutateAsync({
      itemId: 'i1', queueType: 'staging', action: 'flag', notes: 'x', notify: false,
    });

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args.p_notify).toBe(false);
    expect(args.p_notes).toBe('x');
  });

  it('propagates RPC errors', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useTriageAction(), { wrapper });
    await expect(
      result.current.mutateAsync({ itemId: 'i1', queueType: 'staging', action: 'skip' }),
    ).rejects.toEqual({ message: 'rls' });
  });
});
