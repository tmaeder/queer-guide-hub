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
  calls: [] as Array<{ table?: string; rpc?: string; invoke?: string; chain: Array<{ method: string; args: unknown[] }> }>,
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
        const next = state.results.shift() ?? { data: null, error: null };
        return Promise.resolve(next);
      },
    },
  },
}));

import {
  useStoryRoutineRuns,
  useLatestRunsByStory,
  useRoutineRetests,
  useStoryEvents,
  useApproveStoryForClaude,
  useMarkStoryNeedsFollowup,
  useDispatchClaudeRoutine,
  useCancelRoutineRun,
  useStartRetest,
  useVerifyStory,
  useArchiveStory,
  useUnarchiveStory,
} from '../useStoryRoutine';

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

describe('Queries — disabled-when-null', () => {
  it('useStoryRoutineRuns is disabled without storyId', () => {
    renderHook(() => useStoryRoutineRuns(null), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('useRoutineRetests is disabled without routineRunId', () => {
    renderHook(() => useRoutineRetests(null), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('useStoryEvents is disabled without storyId', () => {
    renderHook(() => useStoryEvents(null), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('useLatestRunsByStory is disabled for empty list', () => {
    renderHook(() => useLatestRunsByStory([]), { wrapper });
    expect(state.calls).toHaveLength(0);
  });
});

describe('useStoryRoutineRuns', () => {
  it('queries feedback_routine_runs by story_id, newest first', async () => {
    withResults({ data: [{ id: 'r1', story_id: 's1' }], error: null });
    const { result } = renderHook(() => useStoryRoutineRuns('s1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(state.calls[0].table).toBe('feedback_routine_runs');
    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['story_id', 's1']);
    const order = state.calls[0].chain.find(s => s.method === 'order');
    expect(order?.args[0]).toBe('created_at');
  });

  it('throws on error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useStoryRoutineRuns('s1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useLatestRunsByStory', () => {
  it('builds runByStory + retestByRun maps, picking the newest of each', async () => {
    withResults(
      {
        data: [
          { id: 'r2', story_id: 's1', created_at: '2026-04-10' },
          { id: 'r1', story_id: 's1', created_at: '2026-04-09' },
          { id: 'r3', story_id: 's2', created_at: '2026-04-08' },
        ],
        error: null,
      },
      {
        data: [
          { id: 't2', routine_run_id: 'r2', created_at: '2026-04-11' },
          { id: 't1', routine_run_id: 'r2', created_at: '2026-04-10' },
          { id: 't3', routine_run_id: 'r3', created_at: '2026-04-09' },
        ],
        error: null,
      },
    );

    const { result } = renderHook(() => useLatestRunsByStory(['s1', 's2']), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.runByStory.s1.id).toBe('r2');
    expect(result.current.data?.runByStory.s2.id).toBe('r3');
    expect(result.current.data?.retestByRun.r2.id).toBe('t2');
    expect(result.current.data?.retestByRun.r3.id).toBe('t3');
  });

  it('skips the retest query when no runs are found', async () => {
    withResults({ data: [], error: null });
    const { result } = renderHook(() => useLatestRunsByStory(['s1']), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.runByStory).toEqual({});
    expect(result.current.data?.retestByRun).toEqual({});
    // Only the runs query ran.
    expect(state.calls).toHaveLength(1);
  });
});

describe('useStoryEvents', () => {
  it('honors the custom limit', async () => {
    withResults({ data: [], error: null });
    renderHook(() => useStoryEvents('s1', 50), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const limit = state.calls[0].chain.find(s => s.method === 'limit');
    expect(limit?.args).toEqual([50]);
  });
});

describe('RPC mutations — happy paths', () => {
  it.each([
    ['approve_story_for_claude', () => useApproveStoryForClaude(), { storyId: 's1', note: 'lgtm' }, { p_story_id: 's1', p_note: 'lgtm' }],
    ['mark_story_needs_followup', () => useMarkStoryNeedsFollowup(), { storyId: 's1', reason: 'unclear' }, { p_story_id: 's1', p_reason: 'unclear' }],
    ['cancel_routine_run', () => useCancelRoutineRun(), { runId: 'r1', storyId: 's1', reason: 'wrong fix' }, { p_run_id: 'r1', p_reason: 'wrong fix' }],
    ['verify_story', () => useVerifyStory(), { storyId: 's1', outcome: 'resolved' as const, note: 'shipped' }, { p_story_id: 's1', p_outcome: 'resolved', p_note: 'shipped' }],
    ['archive_story', () => useArchiveStory(), { storyId: 's1', reason: 'duplicate' }, { p_story_id: 's1', p_reason: 'duplicate' }],
    ['unarchive_story', () => useUnarchiveStory(), { storyId: 's1' }, { p_story_id: 's1' }],
  ] as const)('calls %s RPC with correct args', async (rpcName, useHook, mutateArgs, expectedArgs) => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useHook(), { wrapper });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (result.current as any).mutateAsync(mutateArgs);

    const call = state.calls[0];
    expect(call.rpc).toBe(rpcName);
    const [, args] = call.chain[0].args as [string, Record<string, unknown>];
    expect(args).toEqual(expectedArgs);
  });
});

describe('useDispatchClaudeRoutine', () => {
  it('invokes claude-routine-dispatch with story id + optional overrides', async () => {
    withResults({ data: { run_id: 'r1', runner: 'mock' }, error: null });
    const { result } = renderHook(() => useDispatchClaudeRoutine(), { wrapper });
    const out = await result.current.mutateAsync({
      storyId: 's1',
      runner: 'github_actions',
      promptOverride: 'custom prompt',
    });

    expect(out).toEqual({ run_id: 'r1', runner: 'mock' });
    const call = state.calls[0];
    expect(call.invoke).toBe('claude-routine-dispatch');
    const [, opts] = call.chain[0].args as [string, { body: Record<string, unknown> }];
    expect(opts.body).toEqual({
      story_id: 's1',
      runner: 'github_actions',
      prompt_override: 'custom prompt',
    });
  });

  it('throws on edge error', async () => {
    withResults({ data: null, error: { message: 'down' } });
    const { result } = renderHook(() => useDispatchClaudeRoutine(), { wrapper });
    await expect(
      result.current.mutateAsync({ storyId: 's1' }),
    ).rejects.toEqual({ message: 'down' });
  });
});

describe('useStartRetest', () => {
  it('reserves via RPC then dispatches via edge function', async () => {
    const reserved = { id: 'rt1', routine_run_id: 'r1', kind: 'lint' };
    withResults(
      { data: [reserved], error: null }, // start_retest RPC returns array → first element used
      { data: { ok: true }, error: null }, // edge fn
    );

    const { result } = renderHook(() => useStartRetest(), { wrapper });
    const out = await result.current.mutateAsync({
      runId: 'r1',
      storyId: 's1',
      kind: 'lint' as never,
    });

    expect(out).toEqual(reserved);
    expect(state.calls[0].rpc).toBe('start_retest');
    expect(state.calls[1].invoke).toBe('feedback-retest-dispatch');
    const [, opts] = state.calls[1].chain[0].args as [string, { body: { retest_id: string } }];
    expect(opts.body).toEqual({ retest_id: 'rt1' });
  });

  it('defaults runner to "mock" when not provided', async () => {
    withResults(
      { data: { id: 'rt1' }, error: null }, // single object form also accepted
      { data: { ok: true }, error: null },
    );

    const { result } = renderHook(() => useStartRetest(), { wrapper });
    await result.current.mutateAsync({ runId: 'r1', storyId: 's1', kind: 'lint' as never });

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args.p_runner).toBe('mock');
  });

  it('throws when start_retest returns null', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useStartRetest(), { wrapper });
    await expect(
      result.current.mutateAsync({ runId: 'r1', storyId: 's1', kind: 'lint' as never }),
    ).rejects.toThrow('start_retest returned no row');
  });

  it('throws when the edge dispatch fails', async () => {
    withResults(
      { data: [{ id: 'rt1' }], error: null },
      { data: null, error: { message: 'timeout' } },
    );

    const { result } = renderHook(() => useStartRetest(), { wrapper });
    await expect(
      result.current.mutateAsync({ runId: 'r1', storyId: 's1', kind: 'lint' as never }),
    ).rejects.toEqual({ message: 'timeout' });
  });
});
