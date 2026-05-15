/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };
type UnifiedMediaItem = {
  id: string;
  source_type: 'image_asset' | 'cms_media';
  starred?: boolean;
  storage_path?: string | null;
  bucket_name?: string | null;
  usage_count: number;
  alt_text_i18n?: Record<string, string>;
};

const { state, useToastMock, toastFn } = vi.hoisted(() => {
  const toastFn = vi.fn();
  return {
    state: {
      results: [] as MockResult[],
      calls: [] as Array<{ table?: string; storage?: { bucket: string; method: string; args: unknown[] }; invoke?: string; chain: Array<{ method: string; args: unknown[] }> }>,
    },
    useToastMock: vi.fn(),
    toastFn,
  };
});

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
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from(bucket: string) {
        return {
          remove: (paths: string[]) => {
            state.calls.push({ storage: { bucket, method: 'remove', args: [paths] }, chain: [] });
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
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

import { useMediaMutations } from '../useMediaMutations';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function makeItem(over: Partial<UnifiedMediaItem> = {}): UnifiedMediaItem {
  return {
    id: 'm1',
    source_type: 'cms_media',
    starred: false,
    storage_path: 'foo.png',
    bucket_name: 'cms-media',
    usage_count: 0,
    ...over,
  };
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  toastFn.mockReset();
  useToastMock.mockReset();
  useToastMock.mockReturnValue({ toast: toastFn });
});

describe('toggleStar', () => {
  it('updates image_assets table when source_type=image_asset', async () => {
    state.results.push({ data: null, error: null });
    const { result } = renderHook(() => useMediaMutations(), { wrapper });

    await result.current.toggleStar.mutateAsync(makeItem({ source_type: 'image_asset', starred: false }) as never);

    expect(state.calls[0].table).toBe('image_assets');
    const update = state.calls[0].chain.find(s => s.method === 'update');
    expect(update?.args[0]).toEqual({ starred: true });
  });

  it('updates cms_media table for cms_media items', async () => {
    state.results.push({ data: null, error: null });
    const { result } = renderHook(() => useMediaMutations(), { wrapper });

    await result.current.toggleStar.mutateAsync(makeItem({ starred: true }) as never);

    expect(state.calls[0].table).toBe('cms_media');
    const update = state.calls[0].chain.find(s => s.method === 'update');
    expect(update?.args[0]).toEqual({ starred: false });
  });

  it('toasts on error', async () => {
    state.results.push({ data: null, error: { message: 'fail' } });
    const { result } = renderHook(() => useMediaMutations(), { wrapper });
    await expect(result.current.toggleStar.mutateAsync(makeItem() as never)).rejects.toBeDefined();
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Failed to update star', variant: 'destructive' }),
    );
  });
});

describe('deleteItem', () => {
  it('removes storage object + deletes cms_media row for cms_media', async () => {
    state.results.push({ data: null, error: null });
    const { result } = renderHook(() => useMediaMutations(), { wrapper });

    await result.current.deleteItem.mutateAsync(makeItem() as never);

    const storage = state.calls.find(c => c.storage)?.storage;
    expect(storage).toEqual({ bucket: 'cms-media', method: 'remove', args: [['foo.png']] });
    const dbCall = state.calls.find(c => c.table === 'cms_media');
    expect(dbCall?.chain.some(s => s.method === 'delete')).toBe(true);
  });

  it('skips storage remove when storage_path is null', async () => {
    state.results.push({ data: null, error: null });
    const { result } = renderHook(() => useMediaMutations(), { wrapper });
    await result.current.deleteItem.mutateAsync(makeItem({ storage_path: null }) as never);
    expect(state.calls.some(c => c.storage)).toBe(false);
  });

  it('soft-deletes image_asset rows', async () => {
    state.results.push({ data: null, error: null });
    const { result } = renderHook(() => useMediaMutations(), { wrapper });

    await result.current.deleteItem.mutateAsync(makeItem({ source_type: 'image_asset' }) as never);

    const dbCall = state.calls.find(c => c.table === 'image_assets');
    const update = dbCall?.chain.find(s => s.method === 'update');
    expect((update?.args[0] as Record<string, unknown>).status).toBe('deleted');
  });

  it('toasts success', async () => {
    state.results.push({ data: null, error: null });
    const { result } = renderHook(() => useMediaMutations(), { wrapper });
    await result.current.deleteItem.mutateAsync(makeItem() as never);
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Deleted' }));
  });
});

describe('bulkDelete', () => {
  it('skips items with usage_count > 0', async () => {
    state.results.push({ data: null, error: null });
    const { result } = renderHook(() => useMediaMutations(), { wrapper });

    await result.current.bulkDelete.mutateAsync([
      makeItem({ id: 'a', usage_count: 5 }),
      makeItem({ id: 'b', usage_count: 0 }),
    ] as never);

    // Only id=b should have been deleted (storage remove + db delete).
    const dbCalls = state.calls.filter(c => c.table === 'cms_media');
    expect(dbCalls).toHaveLength(1);
  });

  it("toasts plural count on success", async () => {
    const { result } = renderHook(() => useMediaMutations(), { wrapper });
    await result.current.bulkDelete.mutateAsync([
      makeItem({ id: 'a', usage_count: 0 }),
      makeItem({ id: 'b', usage_count: 0 }),
    ] as never);
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Deleted 2 items' }));
  });
});

describe('updateMetadata', () => {
  it('writes alt_text/attribution/license direct on image_assets', async () => {
    state.results.push({ data: null, error: null });
    const { result } = renderHook(() => useMediaMutations(), { wrapper });

    await result.current.updateMetadata.mutateAsync({
      item: makeItem({ source_type: 'image_asset' }) as never,
      updates: { alt_text: 'queer art', attribution: 'photographer', license: 'CC-BY' },
    });

    const update = state.calls[0].chain.find(s => s.method === 'update');
    const payload = update?.args[0] as Record<string, unknown>;
    expect(payload.alt_text).toBe('queer art');
    expect(payload.attribution).toBe('photographer');
    expect(payload.license).toBe('CC-BY');
  });

  it('nests cms_media alt_text under i18n.en, preserving other locales', async () => {
    state.results.push({ data: null, error: null });
    const { result } = renderHook(() => useMediaMutations(), { wrapper });

    await result.current.updateMetadata.mutateAsync({
      item: makeItem({ alt_text_i18n: { de: 'Deutsch' } }) as never,
      updates: { alt_text: 'English' },
    });

    const update = state.calls[0].chain.find(s => s.method === 'update');
    const payload = update?.args[0] as Record<string, unknown>;
    expect(payload.alt_text).toEqual({ de: 'Deutsch', en: 'English' });
  });
});

describe('removeEntityLink + setAsCover', () => {
  it('removeEntityLink deletes image_asset_links with all four filters', async () => {
    state.results.push({ data: null, error: null });
    const { result } = renderHook(() => useMediaMutations(), { wrapper });

    await result.current.removeEntityLink.mutateAsync({
      assetId: 'a1',
      entityType: 'venue',
      entityId: 'v1',
      role: 'cover',
    });

    const call = state.calls[0];
    expect(call.table).toBe('image_asset_links');
    const eqs = call.chain.filter(s => s.method === 'eq').map(s => s.args[0]);
    expect(eqs).toEqual(expect.arrayContaining(['asset_id', 'entity_type', 'entity_id', 'role']));
  });

  it('setAsCover demotes the prior cover, then promotes the new one', async () => {
    state.results.push({ data: null, error: null }, { data: null, error: null });
    const { result } = renderHook(() => useMediaMutations(), { wrapper });

    await result.current.setAsCover.mutateAsync({
      assetId: 'a1',
      entityType: 'venue',
      entityId: 'v1',
    });

    expect(state.calls).toHaveLength(2);
    const [demote, promote] = state.calls;
    expect((demote.chain.find(s => s.method === 'update')!.args[0] as Record<string, unknown>).role).toBe('gallery');
    expect((promote.chain.find(s => s.method === 'update')!.args[0] as Record<string, unknown>).role).toBe('cover');
  });
});

describe('optimizeItem', () => {
  it('invokes optimize-images-batch edge function', async () => {
    state.results.push({ data: null, error: null });
    const { result } = renderHook(() => useMediaMutations(), { wrapper });

    await result.current.optimizeItem.mutateAsync(undefined);

    const call = state.calls[0];
    expect(call.invoke).toBe('optimize-images-batch');
    const [, opts] = call.chain[0].args as [string, { body: { batch_size: number } }];
    expect(opts.body.batch_size).toBe(1);
  });
});
