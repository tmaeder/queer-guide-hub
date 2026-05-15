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
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));

import {
  useStagingItems,
  useDuplicatePairs,
  useEntityById,
  useImportStatistics,
  useImportJobs,
  useBatchFindDuplicates,
  useScanTableDuplicates,
  useMergeEntities,
  useDismissDuplicate,
  useStagingAction,
  useMergeHistory,
} from '../useImportHubQueries';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  toastFn.mockReset();
  useToastMock.mockReset();
  useToastMock.mockReturnValue({ toast: toastFn });
});

describe('useStagingItems', () => {
  it('forwards all filter / page / sort args to get_staging_page RPC', async () => {
    withResults({
      data: { items: [{ id: 's1' }], total: 1, page: 1, per_page: 10, total_pages: 1 },
      error: null,
    });

    const { result } = renderHook(
      () =>
        useStagingItems(
          { target_table: 'venues', review_status: 'pending', dedup_status: null, search: 'foo' },
          2,
          10,
          { field: 'updated_at', dir: 'asc' },
        ),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.items.map(i => (i as { id: string }).id)).toEqual(['s1']);
    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args).toMatchObject({
      p_target_table: 'venues',
      p_review_status: 'pending',
      p_dedup_status: null,
      p_search: 'foo',
      p_page: 2,
      p_per_page: 10,
      p_sort_field: 'updated_at',
      p_sort_dir: 'asc',
    });
  });

  it('fills in defaults when RPC returns sparse data', async () => {
    withResults({ data: {}, error: null });
    const { result } = renderHook(() => useStagingItems(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      items: [],
      total: 0,
      page: 1,
      per_page: 50,
      total_pages: 0,
    });
  });
});

describe('useDuplicatePairs', () => {
  it('is disabled when entityType is null', () => {
    renderHook(() => useDuplicatePairs(null), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it("queries scraper_dedupe_decisions with decision=pending when entityType is 'all'", async () => {
    withResults({ data: [{ id: 'd1' }], error: null });
    const { result } = renderHook(() => useDuplicatePairs('all'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const call = state.calls[0];
    expect(call.table).toBe('scraper_dedupe_decisions');
    const eqs = call.chain.filter(s => s.method === 'eq');
    const cols = eqs.map(e => (e.args as [string, unknown])[0]);
    expect(cols).toContain('decision');
    expect(cols).not.toContain('entity_type');
  });

  it('adds the entity_type filter for a specific type', async () => {
    withResults({ data: [], error: null });
    renderHook(() => useDuplicatePairs('venue'), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const eq = state.calls[0].chain.find(
      s => s.method === 'eq' && (s.args as [string, unknown])[0] === 'entity_type',
    );
    expect(eq?.args).toEqual(['entity_type', 'venue']);
  });

  it('returns [] on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useDuplicatePairs('venue'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual([]);
  });
});

describe('useEntityById', () => {
  it('is disabled without entityType or entityId', () => {
    renderHook(() => useEntityById(null, 'x'), { wrapper });
    renderHook(() => useEntityById('venue', null), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('translates entityType to the correct table name', async () => {
    withResults({ data: { id: 'v1' }, error: null });
    renderHook(() => useEntityById('venue', 'v1'), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));
    expect(state.calls[0].table).toBe('venues');
  });

  it('returns null on supabase error', async () => {
    withResults({ data: null, error: { message: 'fail' } });
    const { result } = renderHook(() => useEntityById('venue', 'v1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toBeNull();
  });
});

describe('useImportStatistics', () => {
  it('normalizes the RPC payload keys', async () => {
    withResults({
      data: {
        total_imports: 100,
        successful_imports: 80,
        failed_imports: 15,
        pending_imports: 5,
        total_records_processed: 1000,
        total_successful_records: 900,
        total_failed_records: 50,
        total_duplicate_records: 50,
        items_pending_review: 25,
        last_import_date: '2026-04-01',
      },
      error: null,
    });

    const { result } = renderHook(() => useImportStatistics(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());

    expect(result.current.data).toEqual({
      total_jobs: 100,
      completed_jobs: 80,
      failed_jobs: 15,
      pending_jobs: 5,
      total_records_processed: 1000,
      total_successful_records: 900,
      total_failed_records: 50,
      total_duplicate_records: 50,
      items_pending_review: 25,
      last_import_date: '2026-04-01',
    });
  });

  it('returns null on RPC error', async () => {
    withResults({ data: null, error: { message: 'down' } });
    const { result } = renderHook(() => useImportStatistics(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useImportJobs', () => {
  it("queries import_jobs_enhanced with status filter when not 'all'", async () => {
    withResults({ data: [{ id: 'j1' }], error: null, count: 1 });
    renderHook(() => useImportJobs(1, 'failed', 10), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const eq = state.calls[0].chain.find(
      s => s.method === 'eq' && (s.args as [string, unknown])[0] === 'status',
    );
    expect(eq?.args).toEqual(['status', 'failed']);
  });

  it('returns { jobs: [], total: 0 } on error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useImportJobs(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({ jobs: [], total: 0 });
  });
});

describe('useBatchFindDuplicates', () => {
  it('calls batch_find_duplicates RPC with defaults', async () => {
    const result = {
      processed: 10, duplicates_found: 2, merge_candidates_found: 1, skipped: 0,
    };
    withResults({ data: result, error: null });

    const { result: hook } = renderHook(() => useBatchFindDuplicates(), { wrapper });
    const out = await hook.current.mutateAsync({});
    expect(out).toEqual(result);

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args).toEqual({ p_target_table: null, p_batch_limit: 100 });
  });

  it('toasts on error', async () => {
    withResults({ data: null, error: { message: 'denied' } });
    const { result: hook } = renderHook(() => useBatchFindDuplicates(), { wrapper });
    await expect(hook.current.mutateAsync({})).rejects.toEqual({ message: 'denied' });
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Scan Failed', variant: 'destructive' }),
    );
  });
});

describe('useScanTableDuplicates', () => {
  it('honors threshold + limit overrides', async () => {
    withResults({ data: { entity_type: 'venues', scanned: 1, duplicates_found: 0, threshold: 0.9 }, error: null });
    const { result: hook } = renderHook(() => useScanTableDuplicates(), { wrapper });
    await hook.current.mutateAsync({ entityType: 'venues', threshold: 0.9, limit: 50 });

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args).toEqual({ p_entity_type: 'venues', p_threshold: 0.9, p_limit: 50 });
  });
});

describe('useMergeEntities', () => {
  it('throws when the RPC payload has an .error field', async () => {
    withResults({ data: { error: 'cannot merge across entity types' }, error: null });

    const { result: hook } = renderHook(() => useMergeEntities(), { wrapper });
    await expect(
      hook.current.mutateAsync({ entityType: 'venues', keepId: 'a', removeId: 'b' }),
    ).rejects.toThrow('cannot merge across entity types');
  });

  it('returns the merge result on success', async () => {
    const merge = {
      success: true, entity_type: 'venues', keep_id: 'a', keep_name: 'A', remove_id: 'b', remove_name: 'B', fk_updates: 3,
    };
    withResults({ data: merge, error: null });
    const { result: hook } = renderHook(() => useMergeEntities(), { wrapper });
    const out = await hook.current.mutateAsync({ entityType: 'venues', keepId: 'a', removeId: 'b' });
    expect(out).toEqual(merge);
  });
});

describe('useDismissDuplicate', () => {
  it("updates scraper_dedupe_decisions setting decision='not_duplicate'", async () => {
    withResults({ data: null, error: null });
    const { result: hook } = renderHook(() => useDismissDuplicate(), { wrapper });
    await hook.current.mutateAsync('d1');

    const call = state.calls[0];
    expect(call.table).toBe('scraper_dedupe_decisions');
    const update = call.chain.find(s => s.method === 'update');
    expect(update?.args[0]).toEqual({ decision: 'not_duplicate' });
    const eq = call.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['id', 'd1']);
  });
});

describe('useStagingAction', () => {
  it('invokes ingestion-review-api with the action payload', async () => {
    withResults({ data: { ok: true }, error: null });
    const { result: hook } = renderHook(() => useStagingAction(), { wrapper });
    await hook.current.mutateAsync({ action: 'bulk_approve', stagingIds: ['s1', 's2'], notes: 'lgtm' });

    const call = state.calls[0];
    expect(call.invoke).toBe('ingestion-review-api');
    const [, opts] = call.chain[0].args as [string, { body: Record<string, unknown> }];
    expect(opts.body).toMatchObject({
      action: 'bulk_approve',
      staging_ids: ['s1', 's2'],
      notes: 'lgtm',
    });
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: '2 items approved' }));
  });
});

describe('useMergeHistory', () => {
  it('queries import_audit_log filtered to action=entity_merged', async () => {
    withResults({ data: [{ id: 'h1', action: 'entity_merged' }], error: null });
    const { result } = renderHook(() => useMergeHistory(20), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const call = state.calls[0];
    expect(call.table).toBe('import_audit_log');
    const eq = call.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['action', 'entity_merged']);
    const limit = call.chain.find(s => s.method === 'limit');
    expect(limit?.args).toEqual([20]);
  });

  it('returns [] on error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useMergeHistory(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual([]);
  });
});
