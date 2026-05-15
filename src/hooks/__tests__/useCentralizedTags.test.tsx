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
  },
}));
vi.mock('@/utils/tagNormalization', () => ({
  normalizeTagName: (n: string) => n.trim().toLowerCase(),
}));

import { useCentralizedTags, useTagUsageCounts } from '../useCentralizedTags';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

// Re-usable seed data — one parent category, two children, two tags each.
// NOTE on ordering: the source kicks off four queries inside a single
// Promise.all. `supabase.rpc()` consumes from state.results EAGERLY at
// construction time (sync), while the .from() builders consume LAZILY via
// .then(). So the RPC result must come first in the queue, then the three
// .from results in the order they're subscribed (which is array order).
function seedFetchAllResults() {
  withResults(
    // [0] get_category_tree RPC — consumed eagerly when rpc() is called.
    {
      data: [
        {
          id: 'community',
          name: 'Community',
          slug: 'community',
          level: 1,
          sort_order: 1,
          tag_count: 0,
          total_tag_count: 2,
          children: [{ id: 'culture', name: 'Culture', slug: 'culture', level: 2, sort_order: 1, parent_id: 'community', tag_count: 2 }],
        },
      ],
      error: null,
    },
    // [1] unified_tags
    {
      data: [
        { id: 't1', name: 'leather', slug: 'leather', usage_count: 100, created_at: '', updated_at: '' },
        { id: 't2', name: 'drag', slug: 'drag', usage_count: 80, created_at: '', updated_at: '' },
        { id: 't3', name: 'pride', slug: 'pride', usage_count: 60, created_at: '', updated_at: '' },
      ],
      error: null,
    },
    // [2] tag_category_assignments
    {
      data: [
        {
          tag_id: 't1',
          category_id: 'kink',
          is_primary: true,
          tag_categories: { id: 'kink', name: 'Kink', slug: 'kink', level: 2, parent_id: 'sexuality' },
        },
        {
          tag_id: 't2',
          category_id: 'culture',
          is_primary: true,
          tag_categories: { id: 'culture', name: 'Culture', slug: 'culture', level: 2, parent_id: 'community' },
        },
        {
          tag_id: 't3',
          category_id: 'culture',
          is_primary: true,
          tag_categories: { id: 'culture', name: 'Culture', slug: 'culture', level: 2, parent_id: 'community' },
        },
      ],
      error: null,
    },
    // [3] tag_categories (for parent lookup)
    {
      data: [
        { id: 'sexuality', name: 'Sexuality & Kink', slug: 'sex', level: 1, parent_id: null },
        { id: 'community', name: 'Community', slug: 'community', level: 1, parent_id: null },
        { id: 'kink', name: 'Kink', slug: 'kink', level: 2, parent_id: 'sexuality' },
        { id: 'culture', name: 'Culture', slug: 'culture', level: 2, parent_id: 'community' },
      ],
      error: null,
    },
  );
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useCentralizedTags — primary fetch + grouping', () => {
  it('enriches tags with their categories and parent_name', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const leather = result.current.allTags.find(t => t.id === 't1')!;
    expect(leather.categories?.[0]).toMatchObject({
      id: 'kink',
      name: 'Kink',
      parent_name: 'Sexuality & Kink',
      is_primary: true,
    });
  });

  it('groups tags into the parent bucket as well as the child', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const cultureBucket = result.current.tagsByCategory.find(c => c.category === 'Culture');
    const communityBucket = result.current.tagsByCategory.find(c => c.category === 'Community');
    expect(cultureBucket?.tags.map(t => t.id).sort()).toEqual(['t2', 't3']);
    expect(communityBucket?.tags.map(t => t.id).sort()).toEqual(['t2', 't3']);
  });

  it('sorts tagsByCategory by descending count', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const counts = result.current.tagsByCategory.map(c => c.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('exposes categoriesTree from the RPC', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.categoriesTree.map(p => p.name)).toEqual(['Community']);
  });

  // (Error-path coverage on this hook is awkward because it specifies
  // retry: 3 internally — would require seeding 4×3 = 12 results.
  // The error→null mapping is exercised by the simpler hooks that share
  // the same React Query pattern.)
});

describe('Pure helper functions', () => {
  it('getTagsByCategory matches by child name OR parent name', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getTagsByCategory('Culture').map(t => t.id).sort()).toEqual(['t2', 't3']);
    expect(result.current.getTagsByCategory('Community').map(t => t.id).sort()).toEqual(['t2', 't3']);
    expect(result.current.getTagsByCategory('Nonexistent')).toEqual([]);
  });

  it('getTagsByParent uses the primary category only', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getTagsByParent('Sexuality & Kink').map(t => t.id)).toEqual(['t1']);
  });

  it('getTagsBySubcategory matches by category id', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getTagsBySubcategory('culture').map(t => t.id).sort()).toEqual(['t2', 't3']);
  });

  it('getParentCategory finds parent containing a child by name', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getParentCategory('Culture')?.id).toBe('community');
    expect(result.current.getParentCategory('Nonexistent')).toBeNull();
  });

  it('getPopularTags filters >0 usage and slices to limit', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getPopularTags(2).map(t => t.id)).toEqual(['t1', 't2']);
  });
});

describe('searchTags', () => {
  it('strips PostgREST special characters and skips empty result', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const out = await result.current.searchTags(',,(%)');
    expect(out).toEqual([]);
    // The 4 hydration calls already happened. No 5th call from searchTags.
    expect(state.calls.length).toBe(4);
  });

  it('forwards sanitized query to .or across name + description', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    withResults({ data: [{ id: 't1', name: 'leather' }], error: null });
    const out = await result.current.searchTags('leather%');
    expect(out.map(t => (t as { id: string }).id)).toEqual(['t1']);

    const searchCall = state.calls[4];
    const or = searchCall.chain.find(s => s.method === 'or');
    const clause = or?.args[0] as string;
    // % stripped to "leather"
    expect(clause).toContain('name.ilike.%leather%');
    expect(clause).not.toContain('leather%%');
  });
});

describe('createTag / updateTag / deleteTag', () => {
  it('createTag normalizes name + falls back to slug derivation', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    withResults({ data: { id: 't_new', name: 'queer code', slug: 'queer-code' }, error: null });
    await result.current.createTag({ name: '  Queer Code  ', slug: '' });

    const insertCall = state.calls[4];
    const insert = insertCall.chain.find(s => s.method === 'insert');
    const payload = (insert?.args[0] as Array<Record<string, unknown>>)[0];
    expect(payload.name).toBe('queer code');
    expect(payload.slug).toBe('queer-code');
  });

  it('updateTag re-normalizes name when present', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    withResults({ data: null, error: null });
    await result.current.updateTag('t1', { name: '  LEATHER ', usage_count: 5 } as never);

    const updateCall = state.calls[4];
    const update = updateCall.chain.find(s => s.method === 'update');
    const payload = update?.args[0] as Record<string, unknown>;
    expect(payload.name).toBe('leather');
    expect(payload.usage_count).toBe(5);
  });

  it('deleteTag throws on error', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    withResults({ data: null, error: { message: 'fk constraint' } });
    await expect(result.current.deleteTag('t1')).rejects.toEqual({ message: 'fk constraint' });
  });
});

describe('useTagUsageCounts', () => {
  it('sums per-entity counts to a name→total map', async () => {
    withResults({
      data: [
        { name: 'leather', usage_count: 0, venue_count: 5, event_count: 3, group_count: 0 },
        { name: 'drag', usage_count: 10, venue_count: 0, event_count: 0, group_count: 0 },
      ],
      error: null,
    });

    const { result } = renderHook(() => useTagUsageCounts(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual({ leather: 8, drag: 10 });
  });

  it('falls back to unified_tags when the summary view errors', async () => {
    withResults(
      { data: null, error: { message: 'no such view' } },
      { data: [{ name: 'leather', usage_count: 99 }], error: null },
    );

    const { result } = renderHook(() => useTagUsageCounts(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual({ leather: 99 });
  });
});
