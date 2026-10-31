/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * useNewsCategoryCounts must ask the database ONCE for every badge.
 *
 * It used to fire one `count: 'exact', head: true` request for the total plus
 * one per category on every /news load; under real traffic those averaged
 * 908 ms and were the largest source of statement timeouts (2026-10-31). The
 * per-tab path survives only for the deploy window before the
 * get_news_category_counts migration applies.
 */
const rpc = vi.fn();
const from = vi.fn();

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedSupabase: { rpc: (...a: unknown[]) => rpc(...a) },
  untypedFrom: vi.fn(),
  untypedRpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...a: unknown[]) => from(...a) },
}));

import { useNewsCategoryCounts } from '../useNews';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const cats = [
  { id: '1', name: 'Community', slug: 'community' },
  { id: '2', name: 'Sports', slug: 'sports' },
  { id: '3', name: 'Empty', slug: 'empty' },
] as never[];

/** A chainable PostgREST stand-in whose every count resolves to `count`. */
function countBuilder(count: number) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'not', 'neq', 'is']) b[m] = vi.fn(() => b);
  b.or = vi.fn(() => b);
  b.then = (res: (v: unknown) => unknown) => Promise.resolve({ count, error: null }).then(res);
  return b;
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe('useNewsCategoryCounts', () => {
  it('reads every badge and the total from one RPC, with no per-tab counts', async () => {
    rpc.mockResolvedValue({
      data: { total: 44034, counts: { community: 5390, sports: 1930, other: 9 } },
      error: null,
    });
    const { result } = renderHook(() => useNewsCategoryCounts(cats), { wrapper });
    await waitFor(() => expect(result.current.totalArticles).toBe(44034));
    expect(result.current.categoryCounts).toEqual({ community: 5390, sports: 1930, empty: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_news_category_counts');
    expect(from).not.toHaveBeenCalled();
  });

  it('falls back to per-tab counts only while the function does not exist yet', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function' },
    });
    from.mockImplementation(() => countBuilder(7));
    const { result } = renderHook(() => useNewsCategoryCounts(cats), { wrapper });
    await waitFor(() => expect(result.current.totalArticles).toBe(7));
    expect(result.current.categoryCounts).toEqual({ community: 7, sports: 7, empty: 7 });
    expect(from).toHaveBeenCalledTimes(cats.length + 1);
  });

  it('does not fall back on any other error, so a timeout cannot re-trigger 11 scans', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'statement timeout' } });
    const { result } = renderHook(() => useNewsCategoryCounts(cats), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(from).not.toHaveBeenCalled();
    expect(result.current.totalArticles).toBeNull();
  });
});
