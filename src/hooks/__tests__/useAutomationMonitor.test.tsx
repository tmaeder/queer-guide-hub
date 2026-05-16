/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null; count?: number };
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
              const next = state.results.shift() ?? { data: [], error: null, count: 0 };
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

import { useAutomationMonitor } from '../useAutomationMonitor';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function seedHydration() {
  withResults(
    { data: [{ id: 'm1', name: 'a', is_enabled: true, total_items_processed: 50 }], error: null }, // modules
    { data: [{ id: 'f1', status: 'pending', content_type: 'venues', content_id: 'v1' }], error: null }, // pendingFlags
    // flagStats: 3 parallel count queries
    { data: null, error: null, count: 5 },
    { data: null, error: null, count: 10 },
    { data: null, error: null, count: 2 },
    { data: [], error: null }, // deadLinks
    { data: [], error: null }, // geoMismatches
  );
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  toastFn.mockReset();
  useToastMock.mockReset();
  useToastMock.mockReturnValue({ toast: toastFn });
});

describe('useAutomationMonitor', () => {
  it('hydrates and computes stats', async () => {
    seedHydration();
    const { result } = renderHook(() => useAutomationMonitor(), { wrapper });
    await waitFor(() => expect(result.current.modules.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.stats.pendingFlags).toBe(5));

    expect(result.current.stats.totalModules).toBe(1);
    expect(result.current.stats.enabledModules).toBe(1);
    expect(result.current.stats.totalProcessed).toBe(50);
  });

  it('toggleModule updates is_enabled + success toast', async () => {
    seedHydration();
    withResults({ data: null, error: null });

    const { result } = renderHook(() => useAutomationMonitor(), { wrapper });
    await waitFor(() => expect(result.current.modules.length).toBeGreaterThan(0));

    await result.current.toggleModule({ moduleId: 'm1', enabled: false });

    const call = state.calls.find(c =>
      c.table === 'automation_modules' && c.chain.some(s => s.method === 'update'),
    );
    const update = call?.chain.find(s => s.method === 'update');
    expect(update?.args[0]).toEqual({ is_enabled: false });
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Module disabled' }),
    );
  });

  it('reviewFlag updates content_flags status + applied_at when approved', async () => {
    seedHydration();
    withResults({ data: null, error: null }, { data: null, error: null });

    const { result } = renderHook(() => useAutomationMonitor(), { wrapper });
    await waitFor(() => expect(result.current.pendingFlags.length).toBeGreaterThan(0));

    await result.current.reviewFlag({ flagId: 'f1', action: 'approved' });

    const updateCall = state.calls.find(c =>
      c.table === 'content_flags' && c.chain.some(s => s.method === 'update'),
    );
    const payload = updateCall?.chain.find(s => s.method === 'update')?.args[0] as Record<string, unknown>;
    expect(payload.status).toBe('approved');
    expect(typeof payload.applied_at).toBe('string');
  });

  it('triggerModule invokes workflow-dispatcher with mapped workflow', async () => {
    seedHydration();
    withResults({ data: { ok: true }, error: null });

    const { result } = renderHook(() => useAutomationMonitor(), { wrapper });
    await waitFor(() => expect(result.current.modules.length).toBeGreaterThan(0));

    await result.current.triggerModule('link-validator');

    const call = state.calls.find(c => c.invoke === 'workflow-dispatcher');
    const [, opts] = call!.chain[0].args as [string, { body: Record<string, unknown> }];
    expect(opts.body.workflow).toBe('link-validation-full');
    expect(opts.body.module).toBe('link-validator');
  });

  it('getModuleByName helper returns matching module', async () => {
    seedHydration();
    const { result } = renderHook(() => useAutomationMonitor(), { wrapper });
    await waitFor(() => expect(result.current.modules.length).toBeGreaterThan(0));

    expect(result.current.getModuleByName('a')?.id).toBe('m1');
    expect(result.current.getModuleByName('nope')).toBeUndefined();
  });
});
