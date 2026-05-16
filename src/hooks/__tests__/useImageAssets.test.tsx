/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

type MockResult = { data: unknown; error: { message: string } | null; count?: number };
const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
}));

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom(table: string) {
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
}));

import { useImageAssets } from '../useImageAssets';

function withResults(...r: MockResult[]) { state.results.push(...r); }
beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('useImageAssets', () => {
  it('does nothing when disabled', () => {
    renderHook(() =>
      useImageAssets({ enabled: false, page: 0, search: '', entityTypeFilter: 'all' as never }),
    );
    expect(state.calls).toHaveLength(0);
  });

  it("applies inner join + entity_type eq when filter !== 'all'", async () => {
    withResults({ data: [], error: null, count: 0 });
    const { result } = renderHook(() =>
      useImageAssets({ enabled: true, page: 0, search: '', entityTypeFilter: 'venue' as never }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const call = state.calls[0];
    const select = call.chain.find(s => s.method === 'select');
    expect(select?.args[0]).toContain('image_asset_links!inner');
    const eq = call.chain.find(
      s => s.method === 'eq' && (s.args as [string, unknown])[0] === 'image_asset_links.entity_type',
    );
    expect(eq?.args).toEqual(['image_asset_links.entity_type', 'venue']);
  });

  it("uses non-inner join when filter='all'", async () => {
    withResults({ data: [], error: null, count: 0 });
    const { result } = renderHook(() =>
      useImageAssets({ enabled: true, page: 0, search: '', entityTypeFilter: 'all' as never }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const select = state.calls[0].chain.find(s => s.method === 'select');
    expect(select?.args[0]).not.toContain('!inner');
  });

  it('applies search via ilike on url + range based on page * PAGE_SIZE', async () => {
    withResults({ data: [], error: null, count: 0 });
    renderHook(() =>
      useImageAssets({ enabled: true, page: 2, search: 'pride', entityTypeFilter: 'all' as never }),
    );
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const ilike = state.calls[0].chain.find(s => s.method === 'ilike');
    expect(ilike?.args).toEqual(['url', '%pride%']);

    const range = state.calls[0].chain.find(s => s.method === 'range');
    expect(range?.args).toEqual([120, 179]); // page 2 → 60-tile pages
  });

  it('maps image_assets rows to MediaItem with derived filename + mime + usage_count', async () => {
    withResults({
      data: [
        {
          id: 'a1',
          url: 'https://example.com/path/photo.PNG?v=1',
          format: 'png',
          bytes: 12345,
          width: 800,
          height: 600,
          source: 'manual',
          created_at: '2026-01-01',
          alt_text: 'A',
          status: 'active',
          is_flagged: false,
          optimization_status: 'optimized',
          image_asset_links: [
            { entity_type: 'venue', entity_id: 'v1' },
            { entity_type: 'venue', entity_id: 'v2' },
            { entity_type: 'event', entity_id: 'e1' },
          ],
        },
      ],
      error: null,
      count: 1,
    });

    const { result } = renderHook(() =>
      useImageAssets({ enabled: true, page: 0, search: '', entityTypeFilter: 'all' as never }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const item = result.current.items[0];
    expect(item.filename).toBe('photo.PNG');
    expect(item.mime_type).toBe('image/png');
    expect(item.usage_count).toBe(3);
    expect(item.entity_types?.sort()).toEqual(['event', 'venue']); // de-duped
    expect(result.current.totalCount).toBe(1);
  });

  it('returns empty + count=0 on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' }, count: null });
    const { result } = renderHook(() =>
      useImageAssets({ enabled: true, page: 0, search: '', entityTypeFilter: 'all' as never }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });
});
