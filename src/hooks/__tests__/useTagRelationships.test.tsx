/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };

const { state, toastFn } = vi.hoisted(() => ({
  state: {
    results: [] as MockResult[],
    calls: [] as Array<{ rpc: string; chain: Array<{ method: string; args: unknown[] }> }>,
  },
  toastFn: vi.fn(),
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
vi.mock('@/hooks/use-toast', () => ({ toast: toastFn }));

import {
  useSimilarTags,
  useTagGraph,
  useComputeTagSimilarities,
} from '../useTagRelationships';

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
  toastFn.mockReset();
});

describe('useSimilarTags', () => {
  it('is disabled without tagId', () => {
    renderHook(() => useSimilarTags(null), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('normalizes tag_name/tag_slug → name/slug and forwards limit + min_score', async () => {
    withResults({
      data: [
        {
          tag_id: 't1',
          tag_name: 'leather',
          tag_slug: 'leather',
          category_name: 'Kink',
          image_url: null,
          usage_count: 50,
          similarity_score: 0.91,
          relationship_type: 'embedding',
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useSimilarTags('t-source', 5), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.[0]).toMatchObject({
      tag_id: 't1',
      name: 'leather',
      slug: 'leather',
      category: 'Kink',
      similarity_score: 0.91,
    });

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args).toEqual({ p_tag_id: 't-source', p_limit: 5, p_min_score: 0.7 });
  });

  it('returns [] when RPC errors', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useSimilarTags('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual([]);
  });
});

describe('useTagGraph', () => {
  it('forwards minScore + optional categoryFilter to get_tag_graph_data', async () => {
    withResults({ data: { nodes: [{ id: 'a' }], edges: [] }, error: null });

    const { result } = renderHook(() => useTagGraph(0.9, 'community'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.nodes.length).toBe(1);

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args.p_min_score).toBe(0.9);
    expect(args.p_category_filter).toBe('community');
  });

  it('omits categoryFilter when null', async () => {
    withResults({ data: { nodes: [], edges: [] }, error: null });
    renderHook(() => useTagGraph(0.8), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args.p_category_filter).toBeUndefined();
  });

  it('throws when RPC fails (propagates to React Query error)', async () => {
    withResults({ data: null, error: { message: 'denied' } });
    const { result } = renderHook(() => useTagGraph(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('returns nodes/edges defaults when RPC returns null', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useTagGraph(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({ nodes: [], edges: [] });
  });
});

describe('useComputeTagSimilarities', () => {
  it('calls compute_tag_similarities RPC + success toast', async () => {
    withResults({
      data: { success: true, embedding_relationships: 10, cooccurrence_relationships: 5, total_relationships: 15 },
      error: null,
    });

    const { result } = renderHook(() => useComputeTagSimilarities(), { wrapper });
    await result.current.mutateAsync();

    expect(state.calls[0].rpc).toBe('compute_tag_similarities');
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Tag Relationships Computed' }),
    );
  });

  it('destructive toast on error', async () => {
    withResults({ data: null, error: { message: 'compute failed' } });
    const { result } = renderHook(() => useComputeTagSimilarities(), { wrapper });
    await expect(result.current.mutateAsync()).rejects.toBeDefined();
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Error', variant: 'destructive' }),
    );
  });
});
