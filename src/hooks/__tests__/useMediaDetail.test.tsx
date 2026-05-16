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
}));

import { useMediaDetail } from '../useMediaDetail';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useMediaDetail', () => {
  it('is disabled without an id', () => {
    renderHook(() => useMediaDetail(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('image_asset resolves entity_links via image_asset_links + name lookup', async () => {
    withResults(
      // admin_media_unified.single()
      { data: { id: 'm1', source_type: 'image_asset' }, error: null },
      // image_asset_links rows
      {
        data: [
          { entity_type: 'venue', entity_id: 'v1', role: 'cover', sort_order: 0 },
          { entity_type: 'event', entity_id: 'e1', role: 'gallery', sort_order: 1 },
          // Unknown entity type bypasses name resolution.
          { entity_type: 'mystery', entity_id: 'x1', role: 'r', sort_order: null },
        ],
        error: null,
      },
      // venues name lookup
      { data: [{ id: 'v1', name: 'Berghain' }], error: null },
      // events name lookup
      { data: [{ id: 'e1', title: 'Pride' }], error: null },
    );

    const { result } = renderHook(() => useMediaDetail('m1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const links = result.current.data!.entity_links;
    expect(links.find(l => l.entity_id === 'v1')?.entity_name).toBe('Berghain');
    expect(links.find(l => l.entity_id === 'e1')?.entity_name).toBe('Pride');
    // Unknown type is preserved without entity_name added.
    const mystery = links.find(l => l.entity_id === 'x1');
    expect(mystery?.entity_type).toBe('mystery');
    expect(mystery?.entity_name).toBeUndefined();
  });

  it('falls back to truncated id when name lookup misses', async () => {
    withResults(
      { data: { id: 'm1', source_type: 'image_asset' }, error: null },
      {
        data: [{ entity_type: 'venue', entity_id: 'venue-id-aaaa-bbbb', role: 'cover', sort_order: 0 }],
        error: null,
      },
      { data: [], error: null }, // no name match
    );

    const { result } = renderHook(() => useMediaDetail('m1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.entity_links[0].entity_name).toBe('venue-id'); // first 8 chars
  });

  it('cms_media path joins cms_content_media + cms_media_attachments', async () => {
    withResults(
      { data: { id: 'm1', source_type: 'cms_media' }, error: null },
      // cms_content_media rows
      {
        data: [
          { content_id: 'c1', cms_content: { title: 'How to' } },
          { content_id: 'c2', cms_content: null }, // null join → 'Untitled'
        ],
        error: null,
      },
      // cms_media_attachments rows
      {
        data: [
          { source_table: 'venue', source_id: 'v1', media_role: 'banner', sort_order: 0 },
        ],
        error: null,
      },
      // venues name lookup for v1
      { data: [{ id: 'v1', name: 'Berghain' }], error: null },
    );

    const { result } = renderHook(() => useMediaDetail('m1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const links = result.current.data!.entity_links;
    expect(links.find(l => l.entity_id === 'c1')?.entity_name).toBe('How to');
    expect(links.find(l => l.entity_id === 'c2')?.entity_name).toBe('Untitled');
    expect(links.find(l => l.entity_id === 'v1')?.entity_name).toBe('Berghain');
  });

  it('throws when initial admin_media_unified fetch fails', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useMediaDetail('m1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
