/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null; count?: number };

const { state, useToastMock, toastFn } = vi.hoisted(() => {
  const toastFn = vi.fn();
  return {
    state: {
      results: [] as MockResult[],
      calls: [] as Array<{ table?: string; rpc?: string; invoke?: string; chain: Array<{ method: string; args: unknown[] }> }>,
    },
    useToastMock: vi.fn(),
    toastFn,
  };
});

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
    channel() {
      return { on() { return this; }, subscribe() { return this; } };
    },
    removeChannel() {},
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));

import { useAutomation } from '../useAutomation';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function seedHydration(
  modules: unknown[] = [],
  pending: unknown[] = [],
  recent: unknown[] = [],
  history: unknown[] = [],
  stats: { pending?: number; auto?: number; total?: number } = {},
) {
  withResults(
    { data: modules, error: null }, // modules query
    { data: pending, error: null }, // pendingChanges
    { data: recent, error: null }, // recentChanges
    { data: history, error: null }, // runHistory
    // stats: 3 parallel count queries
    { data: null, error: null, count: stats.pending ?? 0 },
    { data: null, error: null, count: stats.auto ?? 0 },
    { data: null, error: null, count: stats.total ?? 0 },
  );
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  toastFn.mockReset();
  useToastMock.mockReset();
  useToastMock.mockReturnValue({ toast: toastFn });
});

describe('useAutomation — hydration', () => {
  it('queries automation_modules, content_changes (pending + recent), run log + counts', async () => {
    seedHydration(
      [{ id: 'm1', slug: 's', display_name: 'X', is_enabled: true, last_run_at: '2026-05-10' }],
      [{ id: 'c1', status: 'pending' }],
      [],
      [{ id: 'r1' }],
      { pending: 5, auto: 10, total: 20 },
    );

    const { result } = renderHook(() => useAutomation(), { wrapper });
    await waitFor(() => expect(result.current.modules.length).toBeGreaterThan(0));

    expect(result.current.modules[0].slug).toBe('s');
    expect(result.current.pendingChanges).toHaveLength(1);
    expect(result.current.runHistory).toHaveLength(1);

    // Make sure each query landed in the expected table.
    const tables = state.calls.map(c => c.table).filter(Boolean);
    expect(tables).toContain('automation_modules');
    expect(tables).toContain('content_changes');
    expect(tables).toContain('automation_run_log');
  });

  it('computes stats: lastRun + enabled count + approval_rate', async () => {
    seedHydration(
      [
        { id: 'm1', slug: 'a', is_enabled: true, last_run_at: '2026-05-10T10:00:00Z' },
        { id: 'm2', slug: 'b', is_enabled: false, last_run_at: '2026-05-11T10:00:00Z' },
        { id: 'm3', slug: 'c', is_enabled: true, last_run_at: null },
      ],
      [],
      [],
      [],
      { pending: 4, auto: 12, total: 30 },
    );

    const { result } = renderHook(() => useAutomation(), { wrapper });
    await waitFor(() => expect(result.current.modules.length).toBe(3));

    // Wait for stats memo to settle once the counts query resolves.
    await waitFor(() => expect(result.current.stats.total_proposed_24h).toBe(30));

    expect(result.current.stats.modules_total).toBe(3);
    expect(result.current.stats.modules_enabled).toBe(2);
    expect(result.current.stats.last_run).toBe('2026-05-11T10:00:00Z'); // sorted desc by string
    expect(result.current.stats.pending_changes).toBe(4);
    expect(result.current.stats.auto_approved_24h).toBe(12);
    expect(result.current.stats.approval_rate).toBeCloseTo(12 / 30);
  });

  it('approval_rate is 0 when no 24h activity', async () => {
    seedHydration([], [], [], [], { pending: 0, auto: 0, total: 0 });
    const { result } = renderHook(() => useAutomation(), { wrapper });
    await waitFor(() => expect(result.current.stats.total_proposed_24h).toBe(0));
    expect(result.current.stats.approval_rate).toBe(0);
  });
});

describe('Mutations', () => {
  it('approveChange calls apply_content_change RPC', async () => {
    seedHydration();
    withResults({ data: { ok: true }, error: null });

    const { result } = renderHook(() => useAutomation(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.approveChange('c1');

    const rpc = state.calls.find(c => c.rpc === 'apply_content_change');
    expect(rpc).toBeDefined();
    expect((rpc!.chain[0].args[1] as Record<string, unknown>).p_change_id).toBe('c1');
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Change approved and applied' }),
    );
  });

  it('rejectChange updates content_changes with status=rejected + reviewed_at', async () => {
    seedHydration();
    withResults({ data: null, error: null });

    const { result } = renderHook(() => useAutomation(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.rejectChange('c1');

    const updateCall = state.calls.find(c =>
      c.table === 'content_changes' && c.chain.some(s => s.method === 'update'),
    );
    const payload = updateCall?.chain.find(s => s.method === 'update')?.args[0] as Record<string, unknown>;
    expect(payload.status).toBe('rejected');
    expect(typeof payload.reviewed_at).toBe('string');
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Change rejected' }));
  });

  it('bulkApprove calls bulk_apply_content_changes RPC + toasts with count', async () => {
    seedHydration();
    withResults({ data: { applied: 2 }, error: null });

    const { result } = renderHook(() => useAutomation(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.bulkApprove(['c1', 'c2']);

    const rpc = state.calls.find(c => c.rpc === 'bulk_apply_content_changes');
    expect((rpc!.chain[0].args[1] as Record<string, unknown>).p_change_ids).toEqual(['c1', 'c2']);
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: '2 changes approved and applied' }));
  });

  it('bulkReject .in()s the ids with status=rejected', async () => {
    seedHydration();
    withResults({ data: null, error: null });

    const { result } = renderHook(() => useAutomation(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.bulkReject(['c1', 'c2']);

    // Skip the stats query that also does .in('status', [...]) — find a
    // content_changes call that has BOTH .update and .in('id', ...).
    const call = state.calls.find(c =>
      c.table === 'content_changes'
      && c.chain.some(s => s.method === 'update')
      && c.chain.some(s => s.method === 'in' && (s.args as [string, unknown])[0] === 'id'),
    );
    expect(call).toBeDefined();
    const inCall = call?.chain.find(s => s.method === 'in' && (s.args as [string, unknown])[0] === 'id');
    expect(inCall?.args).toEqual(['id', ['c1', 'c2']]);
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: '2 changes rejected' }));
  });

  it('toggleModule updates automation_modules.is_enabled', async () => {
    seedHydration();
    withResults({ data: null, error: null });

    const { result } = renderHook(() => useAutomation(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.toggleModule({ moduleId: 'm1', enabled: false });

    const call = state.calls.find(c =>
      c.table === 'automation_modules' && c.chain.some(s => s.method === 'update'),
    );
    const payload = call?.chain.find(s => s.method === 'update')?.args[0] as Record<string, unknown>;
    expect(payload.is_enabled).toBe(false);
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Module disabled' }));
  });

  it('runModule invokes content-automation edge with slug + flags, toasts proposed count', async () => {
    seedHydration();
    withResults({ data: { changes_proposed: 3 }, error: null });

    const { result } = renderHook(() => useAutomation(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.runModule({ slug: 'quality', dryRun: true, fullScan: true });

    const call = state.calls.find(c => c.invoke === 'content-automation');
    const [, opts] = call!.chain[0].args as [string, { body: Record<string, unknown> }];
    expect(opts.body).toEqual({ module: 'quality', dry_run: true, full_scan: true });
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Dry run complete (full scan)',
        description: '3 changes proposed.',
      }),
    );
  });

  it('updateModuleSettings forwards the patch as an update', async () => {
    seedHydration();
    withResults({ data: null, error: null });

    const { result } = renderHook(() => useAutomation(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.updateModuleSettings({
      moduleId: 'm1',
      settings: { auto_approve_threshold: 0.85, batch_size: 25 },
    });

    const call = state.calls.find(c =>
      c.table === 'automation_modules' && c.chain.some(s => s.method === 'update'),
    );
    const payload = call?.chain.find(s => s.method === 'update')?.args[0] as Record<string, unknown>;
    expect(payload).toEqual({ auto_approve_threshold: 0.85, batch_size: 25 });
  });

  it('revertChange calls revert_content_change RPC', async () => {
    seedHydration();
    withResults({ data: { reverted: true }, error: null });

    const { result } = renderHook(() => useAutomation(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.revertChange('c1');

    const rpc = state.calls.find(c => c.rpc === 'revert_content_change');
    expect((rpc!.chain[0].args[1] as Record<string, unknown>).p_change_id).toBe('c1');
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Change reverted' }));
  });

  it('error toast fires when a mutation rejects', async () => {
    seedHydration();
    withResults({ data: null, error: { message: 'rls' } });

    const { result } = renderHook(() => useAutomation(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.approveChange('c1')).rejects.toBeDefined();
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Approve failed', variant: 'destructive' }),
    );
  });
});

describe('getModuleBySlug helper', () => {
  it('returns the matching module', async () => {
    seedHydration(
      [
        { id: 'm1', slug: 'a', is_enabled: true },
        { id: 'm2', slug: 'b', is_enabled: false },
      ],
    );
    const { result } = renderHook(() => useAutomation(), { wrapper });
    await waitFor(() => expect(result.current.modules.length).toBe(2));

    expect(result.current.getModuleBySlug('b')?.id).toBe('m2');
    expect(result.current.getModuleBySlug('nope')).toBeUndefined();
  });
});
