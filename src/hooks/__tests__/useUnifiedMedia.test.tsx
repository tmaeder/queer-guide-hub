/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null; count?: number };

const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
}));

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom(table: string) {
    const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
    state.calls.push(record);
    const builder: unknown = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (onFulfilled: (v: MockResult) => unknown) => {
              const next = state.results.shift() ?? { data: [], error: null, count: 0 };
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
}));

import { useUnifiedMedia, PAGE_SIZE } from '../useUnifiedMedia';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function defaultParams(over: Record<string, unknown> = {}) {
  return {
    page: 0,
    search: '',
    statusFilter: 'all' as never,
    entityTypeFilter: 'all' as never,
    formatFilter: 'all' as never,
    sourceTypeFilter: 'all' as never,
    sortBy: 'created_at' as never,
    sortDir: 'desc' as never,
    ...over,
  };
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useUnifiedMedia — base query', () => {
  it('uses admin_media_unified table with .range based on page * PAGE_SIZE', async () => {
    expect(PAGE_SIZE).toBe(60);
    withResults({ data: [{ id: 'm1' }], error: null, count: 1 });

    const { result } = renderHook(
      () => useUnifiedMedia(defaultParams({ page: 2 })),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual({ items: [{ id: 'm1' }], totalCount: 1 });

    const call = state.calls[0];
    expect(call.table).toBe('admin_media_unified');
    const range = call.chain.find(s => s.method === 'range');
    expect(range?.args).toEqual([120, 179]); // page 2 → from=120, to=179
    const order = call.chain.find(s => s.method === 'order');
    expect(order?.args[0]).toBe('created_at');
    expect((order?.args[1] as { ascending: boolean }).ascending).toBe(false);
  });

  it('respects enabled=false (no query fires)', async () => {
    renderHook(() => useUnifiedMedia(defaultParams({ enabled: false })), { wrapper });
    // brief tick — should remain idle
    await new Promise(r => setTimeout(r, 10));
    expect(state.calls).toHaveLength(0);
  });
});

describe('Search parser', () => {
  it('plain text → or() across display_name + alt_text + url', async () => {
    withResults({ data: [], error: null, count: 0 });
    renderHook(() => useUnifiedMedia(defaultParams({ search: 'pride' })), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const or = state.calls[0].chain.find(s => s.method === 'or');
    const clause = or?.args[0] as string;
    expect(clause).toContain('display_name.ilike.%pride%');
    expect(clause).toContain('alt_text.ilike.%pride%');
    expect(clause).toContain('url.ilike.%pride%');
  });

  it('alt:foo → .ilike("alt_text", "%foo%")', async () => {
    withResults({ data: [], error: null, count: 0 });
    renderHook(() => useUnifiedMedia(defaultParams({ search: 'alt:rainbow' })), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const ilike = state.calls[0].chain.find(
      s => s.method === 'ilike' && (s.args as [string, unknown])[0] === 'alt_text',
    );
    expect(ilike?.args).toEqual(['alt_text', '%rainbow%']);
  });

  it('format:png → .ilike("format", "png") (lowercased)', async () => {
    withResults({ data: [], error: null, count: 0 });
    renderHook(() => useUnifiedMedia(defaultParams({ search: 'format:PNG' })), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const ilike = state.calls[0].chain.find(
      s => s.method === 'ilike' && (s.args as [string, unknown])[0] === 'format',
    );
    expect(ilike?.args).toEqual(['format', 'png']);
  });

  it("size:>500kb → .gte('file_size', 512000)", async () => {
    withResults({ data: [], error: null, count: 0 });
    renderHook(() => useUnifiedMedia(defaultParams({ search: 'size:>500kb' })), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const gte = state.calls[0].chain.find(
      s => s.method === 'gte' && (s.args as [string, unknown])[0] === 'file_size',
    );
    expect(gte?.args).toEqual(['file_size', 500 * 1024]);
  });

  it("size:<2mb → .lte('file_size', 2097152)", async () => {
    withResults({ data: [], error: null, count: 0 });
    renderHook(() => useUnifiedMedia(defaultParams({ search: 'size:<2mb' })), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const lte = state.calls[0].chain.find(
      s => s.method === 'lte' && (s.args as [string, unknown])[0] === 'file_size',
    );
    expect(lte?.args).toEqual(['file_size', 2 * 1024 * 1024]);
  });

  it("dim:>1920 → .gte('width', 1920)", async () => {
    withResults({ data: [], error: null, count: 0 });
    renderHook(() => useUnifiedMedia(defaultParams({ search: 'dim:>1920' })), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const gte = state.calls[0].chain.find(
      s => s.method === 'gte' && (s.args as [string, unknown])[0] === 'width',
    );
    expect(gte?.args).toEqual(['width', 1920]);
  });
});

describe('Status filter', () => {
  it("'optimized' → .in('optimization_status', ['optimized', 'cdn_optimized'])", async () => {
    withResults({ data: [], error: null, count: 0 });
    renderHook(
      () => useUnifiedMedia(defaultParams({ statusFilter: 'optimized' })),
      { wrapper },
    );
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const inCall = state.calls[0].chain.find(s => s.method === 'in');
    expect(inCall?.args).toEqual(['optimization_status', ['optimized', 'cdn_optimized']]);
  });

  it.each(['pending', 'processing', 'failed', 'skipped'] as const)(
    "'%s' → .eq('optimization_status', '%s')",
    async status => {
      withResults({ data: [], error: null, count: 0 });
      renderHook(
        () => useUnifiedMedia(defaultParams({ statusFilter: status })),
        { wrapper },
      );
      await waitFor(() => expect(state.calls).toHaveLength(1));

      const eq = state.calls[0].chain.find(
        s => s.method === 'eq' && (s.args as [string, unknown])[0] === 'optimization_status',
      );
      expect(eq?.args).toEqual(['optimization_status', status]);
    },
  );

  it("'no_alt' → .is('alt_text', null)", async () => {
    withResults({ data: [], error: null, count: 0 });
    renderHook(() => useUnifiedMedia(defaultParams({ statusFilter: 'no_alt' })), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const is = state.calls[0].chain.find(
      s => s.method === 'is' && (s.args as [string, unknown])[0] === 'alt_text',
    );
    expect(is?.args).toEqual(['alt_text', null]);
  });
});

describe('Entity / format / sourceType filters', () => {
  it("entityTypeFilter !== 'all' → .contains('entity_types', [type])", async () => {
    withResults({ data: [], error: null, count: 0 });
    renderHook(
      () => useUnifiedMedia(defaultParams({ entityTypeFilter: 'venue' })),
      { wrapper },
    );
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const contains = state.calls[0].chain.find(s => s.method === 'contains');
    expect(contains?.args).toEqual(['entity_types', ['venue']]);
  });

  it("formatFilter !== 'all' → .eq('format', value)", async () => {
    withResults({ data: [], error: null, count: 0 });
    renderHook(
      () => useUnifiedMedia(defaultParams({ formatFilter: 'webp' })),
      { wrapper },
    );
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const eq = state.calls[0].chain.find(
      s => s.method === 'eq' && (s.args as [string, unknown])[0] === 'format',
    );
    expect(eq?.args).toEqual(['format', 'webp']);
  });

  it("sourceTypeFilter !== 'all' → .eq('source_type', value)", async () => {
    withResults({ data: [], error: null, count: 0 });
    renderHook(
      () => useUnifiedMedia(defaultParams({ sourceTypeFilter: 'image_asset' })),
      { wrapper },
    );
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const eq = state.calls[0].chain.find(
      s => s.method === 'eq' && (s.args as [string, unknown])[0] === 'source_type',
    );
    expect(eq?.args).toEqual(['source_type', 'image_asset']);
  });
});

describe('Error path', () => {
  it('throws when supabase returns an error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useUnifiedMedia(defaultParams()), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
