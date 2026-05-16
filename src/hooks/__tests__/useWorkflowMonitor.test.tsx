/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };
const { state, toastFn, useToastMock } = vi.hoisted(() => {
  const toastFn = vi.fn();
  return {
    state: {
      results: [] as MockResult[],
      calls: [] as Array<{ table?: string; invoke?: string; chain: Array<{ method: string; args: unknown[] }> }>,
    },
    toastFn,
    useToastMock: vi.fn(),
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      const builder: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (onFulfilled: (v: MockResult) => unknown) => {
              const next = state.results.shift() ?? { data: [], error: null };
              return Promise.resolve(next).then(onFulfilled);
            };
          }
          return (...args: unknown[]) => { record.chain.push({ method: prop, args }); return builder; };
        },
      });
      return builder;
    },
    functions: {
      invoke(name: string, opts: unknown) {
        state.calls.push({ invoke: name, chain: [{ method: 'invoke', args: [name, opts] }] });
        const next = state.results.shift() ?? { data: null, error: null };
        return Promise.resolve(next);
      },
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));

import { useWorkflowMonitor } from '../useWorkflowMonitor';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function seedHydration() {
  withResults(
    { data: [{ id: 'd1', name: 'wf-a', is_enabled: true, priority: 1 }], error: null },
    {
      data: [
        { id: 'r1', status: 'completed', duration_ms: 1000 },
        { id: 'r2', status: 'failed' },
        { id: 'r3', status: 'running' },
        { id: 'r4', status: 'queued' },
        { id: 'r5', status: 'dead_letter' },
        { id: 'r6', status: 'completed', duration_ms: 2000 },
      ],
      error: null,
    },
  );
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  toastFn.mockReset();
  useToastMock.mockReset();
  useToastMock.mockReturnValue({ toast: toastFn });
});

describe('useWorkflowMonitor — stats', () => {
  it('computes per-status counts + avg duration from completed runs', async () => {
    seedHydration();
    const { result } = renderHook(() => useWorkflowMonitor(), { wrapper });
    await waitFor(() => expect(result.current.runs.length).toBe(6));

    expect(result.current.stats.totalRuns).toBe(6);
    expect(result.current.stats.completedRuns).toBe(2);
    expect(result.current.stats.failedRuns).toBe(1);
    expect(result.current.stats.runningRuns).toBe(1);
    expect(result.current.stats.queuedRuns).toBe(1);
    expect(result.current.stats.deadLetterRuns).toBe(1);
    expect(result.current.stats.avgDurationMs).toBe(1500);
  });

  it('avgDurationMs is null when no completed runs', async () => {
    withResults(
      { data: [], error: null },
      { data: [{ id: 'r1', status: 'failed' }], error: null },
    );
    const { result } = renderHook(() => useWorkflowMonitor(), { wrapper });
    await waitFor(() => expect(result.current.runs.length).toBe(1));
    expect(result.current.stats.avgDurationMs).toBeNull();
  });
});

describe('useWorkflowMonitor — actions', () => {
  it('enqueueWorkflow invokes workflow-dispatcher with action=enqueue + workflow', async () => {
    seedHydration();
    withResults({ data: { run_id: 'r1' }, error: null });

    const { result } = renderHook(() => useWorkflowMonitor(), { wrapper });
    await waitFor(() => expect(result.current.runs.length).toBeGreaterThan(0));

    await result.current.enqueueWorkflow({ workflow: 'wf-news-pipeline', payload: { x: 1 } });

    const call = state.calls.find(c => c.invoke === 'workflow-dispatcher');
    const [, opts] = call!.chain[0].args as [string, { body: Record<string, unknown> }];
    expect(opts.body.action).toBe('enqueue');
    expect(opts.body.workflow).toBe('wf-news-pipeline');
    expect(opts.body.x).toBe(1);
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Workflow enqueued' }),
    );
  });

  it('retryRun invokes action=retry with run_id', async () => {
    seedHydration();
    withResults({ data: { ok: true }, error: null });

    const { result } = renderHook(() => useWorkflowMonitor(), { wrapper });
    await waitFor(() => expect(result.current.runs.length).toBeGreaterThan(0));

    await result.current.retryRun('r1');

    const call = state.calls.find(c => c.invoke === 'workflow-dispatcher');
    const [, opts] = call!.chain[0].args as [string, { body: Record<string, unknown> }];
    expect(opts.body).toEqual({ action: 'retry', run_id: 'r1' });
  });

  it('cancelRun invokes action=cancel', async () => {
    seedHydration();
    withResults({ data: null, error: null });

    const { result } = renderHook(() => useWorkflowMonitor(), { wrapper });
    await waitFor(() => expect(result.current.runs.length).toBeGreaterThan(0));

    await result.current.cancelRun('r1');

    const call = state.calls.find(c => c.invoke === 'workflow-dispatcher');
    const [, opts] = call!.chain[0].args as [string, { body: Record<string, unknown> }];
    expect(opts.body.action).toBe('cancel');
  });

  it('dispatchNow invokes action=dispatch with count-aware toast', async () => {
    seedHydration();
    withResults({ data: { dispatched: 5 }, error: null });

    const { result } = renderHook(() => useWorkflowMonitor(), { wrapper });
    await waitFor(() => expect(result.current.runs.length).toBeGreaterThan(0));

    await result.current.dispatchNow();

    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Dispatcher ran',
        description: '5 jobs dispatched.',
      }),
    );
  });

  it('error toast on enqueue failure', async () => {
    seedHydration();
    withResults({ data: null, error: { message: 'down' } });

    const { result } = renderHook(() => useWorkflowMonitor(), { wrapper });
    await waitFor(() => expect(result.current.runs.length).toBeGreaterThan(0));

    await expect(
      result.current.enqueueWorkflow({ workflow: 'wf', payload: {} }),
    ).rejects.toBeDefined();
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Enqueue failed', variant: 'destructive' }),
    );
  });

  it('activeRuns + deadLetterRuns memos derive correctly', async () => {
    seedHydration();
    const { result } = renderHook(() => useWorkflowMonitor(), { wrapper });
    await waitFor(() => expect(result.current.runs.length).toBe(6));

    expect(result.current.activeRuns.length).toBe(2); // running + queued
    expect(result.current.deadLetterRuns.length).toBe(1);
  });

  it('getDefinitionByName helper', async () => {
    seedHydration();
    const { result } = renderHook(() => useWorkflowMonitor(), { wrapper });
    await waitFor(() => expect(result.current.definitions.length).toBeGreaterThan(0));

    expect(result.current.getDefinitionByName('wf-a')?.id).toBe('d1');
    expect(result.current.getDefinitionByName('nope')).toBeUndefined();
  });
});
