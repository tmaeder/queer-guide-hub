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
  calls: [] as Array<{
    table?: string;
    rpc?: string;
    chain: Array<{ method: string; args: unknown[] }>;
  }>,
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

import {
  useCentralizedTags,
  useTagUsageCounts,
  fetchAllPages,
  TAG_INDEX_COLUMNS,
  type PageResult,
} from '../useCentralizedTags';

function withResults(...r: MockResult[]) {
  state.results.push(...r);
}
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
          children: [
            {
              id: 'culture',
              name: 'Culture',
              slug: 'culture',
              level: 2,
              sort_order: 1,
              parent_id: 'community',
              tag_count: 2,
            },
          ],
        },
      ],
      error: null,
    },
    // [1] unified_tags
    {
      data: [
        {
          id: 't1',
          name: 'leather',
          slug: 'leather',
          usage_count: 100,
          created_at: '',
          updated_at: '',
        },
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
          tag_categories: {
            id: 'kink',
            name: 'Kink',
            slug: 'kink',
            level: 2,
            parent_id: 'sexuality',
          },
        },
        {
          tag_id: 't2',
          category_id: 'culture',
          is_primary: true,
          tag_categories: {
            id: 'culture',
            name: 'Culture',
            slug: 'culture',
            level: 2,
            parent_id: 'community',
          },
        },
        {
          tag_id: 't3',
          category_id: 'culture',
          is_primary: true,
          tag_categories: {
            id: 'culture',
            name: 'Culture',
            slug: 'culture',
            level: 2,
            parent_id: 'community',
          },
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

    const leather = result.current.allTags.find((t) => t.id === 't1')!;
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

    const cultureBucket = result.current.tagsByCategory.find((c) => c.category === 'Culture');
    const communityBucket = result.current.tagsByCategory.find((c) => c.category === 'Community');
    expect(cultureBucket?.tags.map((t) => t.id).sort()).toEqual(['t2', 't3']);
    expect(communityBucket?.tags.map((t) => t.id).sort()).toEqual(['t2', 't3']);
  });

  it('sorts tagsByCategory by descending count', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const counts = result.current.tagsByCategory.map((c) => c.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('exposes categoriesTree from the RPC', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.categoriesTree.map((p) => p.name)).toEqual(['Community']);
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

    expect(
      result.current
        .getTagsByCategory('Culture')
        .map((t) => t.id)
        .sort(),
    ).toEqual(['t2', 't3']);
    expect(
      result.current
        .getTagsByCategory('Community')
        .map((t) => t.id)
        .sort(),
    ).toEqual(['t2', 't3']);
    expect(result.current.getTagsByCategory('Nonexistent')).toEqual([]);
  });

  it('getTagsByParent uses the primary category only', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getTagsByParent('Sexuality & Kink').map((t) => t.id)).toEqual(['t1']);
  });

  it('getTagsBySubcategory matches by category id', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(
      result.current
        .getTagsBySubcategory('culture')
        .map((t) => t.id)
        .sort(),
    ).toEqual(['t2', 't3']);
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

    expect(result.current.getPopularTags(2).map((t) => t.id)).toEqual(['t1', 't2']);
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
    expect(out.map((t) => (t as { id: string }).id)).toEqual(['t1']);

    const searchCall = state.calls[4];
    const or = searchCall.chain.find((s) => s.method === 'or');
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
    const insert = insertCall.chain.find((s) => s.method === 'insert');
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
    const update = updateCall.chain.find((s) => s.method === 'update');
    const payload = update?.args[0] as Record<string, unknown>;
    expect(payload.name).toBe('leather');
    expect(payload.usage_count).toBe(5);
  });

  it('deleteTag throws on error', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    withResults({ data: null, error: { message: 'fk constraint' } });
    // A real Error, not the bare `{ message }` PostgREST hands back. Every
    // caller narrows with `err instanceof Error`, so rethrowing the raw object
    // discards the message — which for admin_delete_tag is the refusal
    // breakdown naming what still references the tag, i.e. the whole point.
    await expect(result.current.deleteTag('t1')).rejects.toThrow('fk constraint');
  });

  it('deleteTag goes through admin_delete_tag, never a raw table delete', async () => {
    // The guard that matters. A raw `DELETE FROM unified_tags` cascades the
    // tag's citations, clinical codes and ontology edges away, SET-NULLs its
    // slug redirects, and leaves `tags text[]` on 20+ content tables naming a
    // tag whose page is now a 404 — those arrays have no FK, so nothing
    // notices. admin_delete_tag refuses when any of that holds.
    //
    // The sibling assertion above only proves an error propagates; it passes
    // whichever call is made, so on its own it would not catch a revert.
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    state.calls.length = 0;
    withResults({ data: { deleted: true }, error: null });
    await result.current.deleteTag('t1');

    const rpcCall = state.calls.find((c) => c.rpc === 'admin_delete_tag');
    expect(rpcCall, 'deleteTag must call the admin_delete_tag RPC').toBeTruthy();
    expect(rpcCall?.chain[0]?.args[1]).toMatchObject({ p_tag_id: 't1' });

    const rawDelete = state.calls.find(
      (c) => c.table === 'unified_tags' && c.chain.some((s) => s.method === 'delete'),
    );
    expect(rawDelete, 'deleteTag must not issue a raw delete on unified_tags').toBeFalsy();
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

describe('TAG_INDEX_COLUMNS — the corpus select is narrowed, and stays narrowed', () => {
  // This was `select('*')`. `*` on unified_tags is 42 columns, and three of
  // them (long_description, description_i18n, quality_breakdown) are most of
  // the bytes: measured on prod 2026-09-05 the active corpus was 7.98 MB as
  // `*` against 1.98 MB as this list. A signed-in /tags load took 28.9s and
  // started timing out the nightly e2e specs. Reverting to `*` would not fail
  // any render assertion — it would just get slow again — so the guard has to
  // be on the query.
  it('asks for named columns, never *', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const tagsCall = state.calls.find((c) => c.table === 'unified_tags')!;
    const select = tagsCall.chain.find((s) => s.method === 'select')!.args[0] as string;
    expect(select).toBe(TAG_INDEX_COLUMNS);
    expect(select).not.toContain('*');
  });

  it('covers every column the index, the picker and /admin/tags render', () => {
    // TagsIndex: haystack + letter + sorts + entity_kind filter.
    // TagIndexRow: short_description || description. AdminTags TagRow.
    for (const col of [
      'id',
      'name',
      'slug',
      'category',
      'description',
      'short_description',
      'usage_count',
      'created_at',
      'entity_kind',
      'status',
      'deprecation_reason',
    ]) {
      expect(TAG_INDEX_COLUMNS.split(',').map((s) => s.trim())).toContain(col);
    }
  });

  it('leaves the heavy detail-page columns out', () => {
    for (const col of ['long_description', 'description_i18n', 'name_i18n', 'quality_breakdown']) {
      expect(TAG_INDEX_COLUMNS).not.toContain(col);
    }
  });

  // The assignment rows carry ids only now; `tag_categories` is fetched once
  // (53 rows) instead of being embedded on each of ~7.2k assignments.
  it('does not re-embed tag_categories on every assignment row', async () => {
    seedFetchAllResults();
    const { result } = renderHook(() => useCentralizedTags(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const call = state.calls.find((c) => c.table === 'tag_category_assignments')!;
    const select = call.chain.find((s) => s.method === 'select')!.args[0] as string;
    expect(select).not.toContain('tag_categories(');
  });
});

describe('fetchAllPages', () => {
  /** A pager over a fixed row count, recording the ranges it was asked for. */
  function pagerOver(total: number, ranges: Array<[number, number]>) {
    return (from: number, to: number): PromiseLike<PageResult<number>> => {
      ranges.push([from, to]);
      const rows = Array.from({ length: total }, (_, i) => i).slice(from, to + 1);
      return Promise.resolve({ data: rows, error: null, count: total });
    };
  }

  it('returns the first page as-is when the corpus fits under max-rows', async () => {
    const ranges: Array<[number, number]> = [];
    const rows = await fetchAllPages('t', pagerOver(42, ranges));
    expect(rows).toHaveLength(42);
    expect(ranges).toEqual([[0, 999]]);
  });

  it('fires the remaining pages CONCURRENTLY, in order, from the exact count', async () => {
    const ranges: Array<[number, number]> = [];
    const rows = await fetchAllPages('t', pagerOver(2500, ranges));

    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    // Concatenated in page order, not completion order.
    expect(rows).toHaveLength(2500);
    expect(rows[0]).toBe(0);
    expect(rows[2499]).toBe(2499);
  });

  it('has ALL tail pages in flight before any of them resolves', async () => {
    // The `ranges` assertion above passes just as happily against the old
    // `for (;;) range(from, from + PAGE - 1)` loop — same requests, one at a
    // time. What changed is DEPTH: sequential paging made the round-trip count
    // grow with the corpus, which is the half of this that keeps working as
    // the glossary grows. So assert the overlap, not the ranges.
    let resolved = 0;
    const requestedAfterAResolve: number[] = [];
    const page = (from: number, to: number): PromiseLike<PageResult<number>> => {
      if (from > 0 && resolved > 1) requestedAfterAResolve.push(from);
      const rows = Array.from({ length: 4000 }, (_, i) => i).slice(from, to + 1);
      return new Promise((res) =>
        setTimeout(() => {
          resolved++;
          res({ data: rows, error: null, count: 4000 });
        }, 10),
      );
    };
    const rows = await fetchAllPages('t', page);
    expect(rows).toHaveLength(4000);
    // `resolved > 1` skips the first page, which must resolve before the count
    // is known. Every page after it went out while the others were still open.
    expect(requestedAfterAResolve).toEqual([]);
  });

  it('resolves the tail page even when it comes back before an earlier one', async () => {
    // Concurrency means completion order is not request order. The result must
    // still be ordered by page, or a corpus sorted by usage_count silently
    // interleaves.
    const page = (from: number, to: number): PromiseLike<PageResult<number>> => {
      const rows = Array.from({ length: 2500 }, (_, i) => i).slice(from, to + 1);
      const delay = from === 1000 ? 20 : 0;
      return new Promise((res) =>
        setTimeout(() => res({ data: rows, error: null, count: 2500 }), delay),
      );
    };
    const rows = await fetchAllPages('t', page);
    expect(rows.map((r, i) => r === i).every(Boolean)).toBe(true);
  });

  it('THROWS on a failed later page rather than returning a short corpus', async () => {
    // A silently truncated read here is not a degraded glossary, it is a wrong
    // one: the missing rows are category assignments, and a tag with no
    // categories can never match ADULT_CATEGORY_NAMES — so swallowing the page
    // un-gates 18+ terms. The old loop `break`ed and kept what it had.
    const page = (from: number): PromiseLike<PageResult<number>> =>
      Promise.resolve(
        from === 0
          ? { data: Array.from({ length: 1000 }, (_, i) => i), error: null, count: 2000 }
          : { data: null, error: { message: 'statement timeout' }, count: null },
      );
    await expect(fetchAllPages('unified_tags', page)).rejects.toThrow(
      /unified_tags: statement timeout/,
    );
  });

  it('THROWS on a failed first page', async () => {
    const page = (): PromiseLike<PageResult<number>> =>
      Promise.resolve({ data: null, error: { message: 'down' }, count: null });
    await expect(fetchAllPages('x', page)).rejects.toThrow(/x: down/);
  });

  it('stops on a short page when the backend reports no count', async () => {
    const ranges: Array<[number, number]> = [];
    const page = (from: number, to: number): PromiseLike<PageResult<number>> => {
      ranges.push([from, to]);
      return Promise.resolve({ data: [1, 2, 3], error: null, count: null });
    };
    await fetchAllPages('t', page);
    expect(ranges).toEqual([[0, 999]]);
  });
});
