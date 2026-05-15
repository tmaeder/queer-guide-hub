/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };

const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  calls: [] as Array<{ table?: string; rpc?: string; chain: Array<{ method: string; args: unknown[] }> }>,
}));

vi.mock('@/integrations/supabase/untyped', () => {
  function builder(record: { table: string; chain: Array<{ method: string; args: unknown[] }> }) {
    const b: unknown = new Proxy(
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
            return b;
          };
        },
      },
    );
    return b;
  }
  return {
    untypedFrom(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      return builder(record);
    },
    untypedSupabase: {
      rpc(name: string, args: unknown) {
        state.calls.push({ rpc: name, chain: [{ method: 'rpc', args: [name, args] }] });
        const next = state.results.shift() ?? { data: null, error: null };
        return Promise.resolve(next);
      },
    },
  };
});

import {
  useQuests,
  useQuest,
  useActiveQuest,
  useQuestProgress,
  useQuestContributors,
  useQuestMutations,
  useMyQuestParticipation,
  useJoinQuest,
} from '../useQuests';

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
});

describe('useQuests (list)', () => {
  it("excludes drafts by default via .neq('status', 'draft')", async () => {
    withResults({ data: [{ id: 'q1', status: 'active' }], error: null });
    const { result } = renderHook(() => useQuests(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const neq = state.calls[0].chain.find(s => s.method === 'neq');
    expect(neq?.args).toEqual(['status', 'draft']);
  });

  it('includes drafts when includeDraft=true', async () => {
    withResults({ data: [], error: null });
    renderHook(() => useQuests({ includeDraft: true }), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    expect(state.calls[0].chain.some(s => s.method === 'neq')).toBe(false);
  });
});

describe('useQuest (by slug)', () => {
  it('is disabled without slug', () => {
    renderHook(() => useQuest(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('queries quests by slug', async () => {
    withResults({ data: { id: 'q1', slug: 'pride' }, error: null });
    const { result } = renderHook(() => useQuest('pride'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['slug', 'pride']);
  });
});

describe('useActiveQuest', () => {
  it('uses the active_quest RPC and unwraps the array form', async () => {
    withResults({ data: [{ id: 'q1', status: 'active' }], error: null });
    const { result } = renderHook(() => useActiveQuest(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(state.calls[0].rpc).toBe('active_quest');
    expect(result.current.data).toEqual({ id: 'q1', status: 'active' });
  });

  it('returns null when RPC returns null', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useActiveQuest(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useQuestProgress', () => {
  it('is disabled without questId', () => {
    renderHook(() => useQuestProgress(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('falls back to zeroed counts when RPC returns null', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useQuestProgress('q1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual({
      accepted_count: 0,
      pending_count: 0,
      contributor_count: 0,
      target_count: 0,
    });
  });

  it('forwards the questId to the RPC', async () => {
    withResults({ data: { accepted_count: 5 }, error: null });
    renderHook(() => useQuestProgress('q1'), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args).toEqual({ p_quest_id: 'q1' });
  });
});

describe('useQuestContributors', () => {
  it('passes through array results from quest_public_contributors RPC', async () => {
    withResults({
      data: [{ user_id: 'u1', display_name: 'Alice', accepted_count: 3 }],
      error: null,
    });
    const { result } = renderHook(() => useQuestContributors('q1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.[0].display_name).toBe('Alice');
    expect(state.calls[0].rpc).toBe('quest_public_contributors');
  });
});

describe('useQuestMutations', () => {
  it('create inserts a quest row', async () => {
    withResults({ data: { id: 'q1', title: 'New' }, error: null });
    const { result } = renderHook(() => useQuestMutations(), { wrapper });

    const out = await result.current.create.mutateAsync({ title: 'New', slug: 'new' } as never);
    expect(out.id).toBe('q1');

    const call = state.calls[0];
    expect(call.table).toBe('quests');
    expect(call.chain.some(s => s.method === 'insert')).toBe(true);
  });

  it('update strips the id and forwards the patch', async () => {
    withResults({ data: { id: 'q1', title: 'Edited' }, error: null });
    const { result } = renderHook(() => useQuestMutations(), { wrapper });

    await result.current.update.mutateAsync({ id: 'q1', title: 'Edited' } as never);

    const call = state.calls[0];
    const update = call.chain.find(s => s.method === 'update');
    expect((update?.args[0] as Record<string, unknown>).id).toBeUndefined();
    expect((update?.args[0] as Record<string, unknown>).title).toBe('Edited');

    const eq = call.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['id', 'q1']);
  });

  it('remove deletes by id', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useQuestMutations(), { wrapper });
    await result.current.remove.mutateAsync('q1');

    const call = state.calls[0];
    expect(call.chain.some(s => s.method === 'delete')).toBe(true);
  });

  it('createRecap calls quest_create_recap_stub RPC', async () => {
    withResults({ data: 'art-123', error: null });
    const { result } = renderHook(() => useQuestMutations(), { wrapper });

    const id = await result.current.createRecap.mutateAsync('q1');
    expect(id).toBe('art-123');
    expect(state.calls[0].rpc).toBe('quest_create_recap_stub');
  });
});

describe('useMyQuestParticipation', () => {
  it('is disabled when either questId or userId is missing', () => {
    renderHook(() => useMyQuestParticipation(undefined, 'u1'), { wrapper });
    renderHook(() => useMyQuestParticipation('q1', undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('queries quest_participations filtered by both ids', async () => {
    withResults({ data: { id: 'p1', opted_in_public: true, display_name: 'Alice' }, error: null });
    const { result } = renderHook(
      () => useMyQuestParticipation('q1', 'u1'),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    const eqs = state.calls[0].chain.filter(s => s.method === 'eq');
    const cols = eqs.map(e => (e.args as [string, unknown])[0]);
    expect(cols).toEqual(['quest_id', 'user_id']);
  });
});

describe('useJoinQuest', () => {
  it('upserts with onConflict user_id+quest_id', async () => {
    withResults({ data: { id: 'p1' }, error: null });
    const { result } = renderHook(() => useJoinQuest(), { wrapper });

    await result.current.mutateAsync({
      quest_id: 'q1',
      user_id: 'u1',
      opted_in_public: true,
      display_name: 'Alice',
    });

    const call = state.calls[0];
    const upsert = call.chain.find(s => s.method === 'upsert');
    expect(upsert?.args[1]).toEqual({ onConflict: 'user_id,quest_id' });
    expect((upsert?.args[0] as Record<string, unknown>).quest_id).toBe('q1');
  });
});
