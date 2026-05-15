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
    calls: [] as Array<{ table?: string; rpc?: string; invoke?: string; auth?: string; chain: Array<{ method: string; args: unknown[] }> }>,
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
    rpc(name: string, args: unknown) {
      state.calls.push({ rpc: name, chain: [{ method: 'rpc', args: [name, args] }] });
      const next = state.results.shift() ?? { data: null, error: null };
      return Promise.resolve(next);
    },
    functions: {
      invoke(name: string, opts: unknown) {
        state.calls.push({ invoke: name, chain: [{ method: 'invoke', args: [name, opts] }] });
        return Promise.resolve({ data: null, error: null });
      },
    },
    auth: {
      getUser() {
        state.calls.push({ auth: 'getUser', chain: [] });
        return Promise.resolve({ data: { user: { id: 'u1' } }, error: null });
      },
    },
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import {
  useMyIntimateProfile,
  useIntimateProfile,
  useIntimateDiscovery,
  useUpsertIntimateProfile,
  useOptOutIntimateProfile,
  useIntimateKinkTags,
  useMyIntimateText,
  useSetIntimateText,
  useReportIntimateProfile,
} from '../useIntimateProfile';

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

describe('useMyIntimateProfile', () => {
  it('is disabled when no user', () => {
    useAuthMock.mockReturnValue({ user: null });
    renderHook(() => useMyIntimateProfile(), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('queries intimate_profiles for the current user', async () => {
    withResults({ data: { id: 'u1', genitalia: 'penis' }, error: null });
    const { result } = renderHook(() => useMyIntimateProfile(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const call = state.calls[0];
    expect(call.table).toBe('intimate_profiles');
    const eq = call.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['id', 'u1']);
  });
});

describe('useIntimateProfile', () => {
  it('is disabled without userId', () => {
    renderHook(() => useIntimateProfile(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('queries by the provided user id', async () => {
    withResults({ data: null, error: null });
    renderHook(() => useIntimateProfile('u2'), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['id', 'u2']);
  });
});

describe('useIntimateDiscovery', () => {
  it('applies all filter dimensions when provided', async () => {
    withResults({ data: [], error: null });
    renderHook(
      () => useIntimateDiscovery({
        cityId: 'c1',
        roles: ['top', 'bottom'],
        intoTags: ['leather'],
        ageBands: ['25-34'],
        bodyTypes: ['lean'],
      }),
      { wrapper },
    );
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const call = state.calls[0];
    expect(call.table).toBe('intimate_discovery_v');

    const eq = call.chain.find(s => s.method === 'eq' && (s.args as [string, unknown])[0] === 'discovery_city_id');
    expect(eq?.args).toEqual(['discovery_city_id', 'c1']);
    const overlaps = call.chain.filter(s => s.method === 'overlaps');
    expect(overlaps.map(o => o.args[0])).toEqual(['role', 'into_tags']);
    const ins = call.chain.filter(s => s.method === 'in');
    expect(ins.map(i => i.args[0])).toEqual(['age_band', 'body_type']);
  });

  it('skips filters when their arrays are empty', async () => {
    withResults({ data: [], error: null });
    renderHook(() => useIntimateDiscovery({ roles: [] }), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const overlaps = state.calls[0].chain.find(s => s.method === 'overlaps');
    expect(overlaps).toBeUndefined();
  });
});

describe('useUpsertIntimateProfile', () => {
  it('rejects when not signed in', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useUpsertIntimateProfile(), { wrapper });
    await expect(result.current.mutateAsync({ height_cm: 180 } as never)).rejects.toThrow('not signed in');
  });

  it('upserts with id=user.id + onConflict=id', async () => {
    withResults({ data: { id: 'u1', height_cm: 180 }, error: null });
    const { result } = renderHook(() => useUpsertIntimateProfile(), { wrapper });
    await result.current.mutateAsync({ height_cm: 180 } as never);

    const upsert = state.calls[0].chain.find(s => s.method === 'upsert');
    expect(upsert?.args[0]).toMatchObject({ id: 'u1', height_cm: 180 });
    expect(upsert?.args[1]).toEqual({ onConflict: 'id' });
  });
});

describe('useOptOutIntimateProfile', () => {
  it('rejects when not signed in', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useOptOutIntimateProfile(), { wrapper });
    await expect(result.current.mutateAsync({})).rejects.toThrow('not signed in');
  });

  it('soft-opt-out sets opted_in_at=null', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useOptOutIntimateProfile(), { wrapper });
    await result.current.mutateAsync({});

    const update = state.calls[0].chain.find(s => s.method === 'update');
    expect(update?.args[0]).toEqual({ opted_in_at: null });
  });

  it('hardDelete deletes the row', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useOptOutIntimateProfile(), { wrapper });
    await result.current.mutateAsync({ hardDelete: true });

    expect(state.calls[0].chain.some(s => s.method === 'delete')).toBe(true);
  });
});

describe('useIntimateKinkTags', () => {
  it('queries unified_tags filtered to intimate_kink + active', async () => {
    withResults({ data: [{ slug: 'leather', name: 'Leather' }], error: null });
    const { result } = renderHook(() => useIntimateKinkTags(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const eqs = state.calls[0].chain.filter(s => s.method === 'eq');
    const eqMap = Object.fromEntries(eqs.map(e => e.args as [string, unknown]));
    expect(eqMap.category).toBe('intimate_kink');
    expect(eqMap.status).toBe('active');
  });
});

describe('useMyIntimateText', () => {
  it('returns the first RPC row or defaults', async () => {
    withResults({ data: [{ about_intimate: 'hello', looking_for: 'fun' }], error: null });
    const { result } = renderHook(() => useMyIntimateText(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({ about_intimate: 'hello', looking_for: 'fun' });

    expect(state.calls[0].rpc).toBe('intimate_get_my_text');
  });

  it('defaults to nulls when RPC returns empty', async () => {
    withResults({ data: [], error: null });
    const { result } = renderHook(() => useMyIntimateText(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({ about_intimate: null, looking_for: null });
  });
});

describe('useSetIntimateText', () => {
  it('calls intimate_set_text RPC then fires moderation when content non-empty', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useSetIntimateText(), { wrapper });
    await result.current.mutateAsync({ aboutIntimate: 'I like X', lookingFor: null });

    expect(state.calls[0].rpc).toBe('intimate_set_text');
    // Should subsequently call auth.getUser + functions.invoke('intimate-moderation').
    expect(state.calls.some(c => c.auth === 'getUser')).toBe(true);
    expect(state.calls.some(c => c.invoke === 'intimate-moderation')).toBe(true);
  });

  it('skips moderation when both fields are empty', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useSetIntimateText(), { wrapper });
    await result.current.mutateAsync({ aboutIntimate: null, lookingFor: null });

    expect(state.calls.some(c => c.invoke === 'intimate-moderation')).toBe(false);
  });
});

describe('useReportIntimateProfile', () => {
  it('rejects when not signed in', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useReportIntimateProfile(), { wrapper });
    await expect(
      result.current.mutateAsync({ targetId: 'u2', reason: 'harassment' }),
    ).rejects.toThrow('not signed in');
  });

  it('inserts an intimate_reports row with reporter + target + reason', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useReportIntimateProfile(), { wrapper });
    await result.current.mutateAsync({ targetId: 'u2', reason: 'spam', details: 'lots of bots' });

    const call = state.calls[0];
    expect(call.table).toBe('intimate_reports');
    const insert = call.chain.find(s => s.method === 'insert');
    expect(insert?.args[0]).toEqual({
      reporter_id: 'u1',
      target_id: 'u2',
      reason: 'spam',
      details: 'lots of bots',
    });
  });
});
