import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { TestProviders } from '@/test/test-utils';

const { auth, calls, result, toast } = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null },
  calls: [] as Array<[string, unknown[]]>,
  result: { value: { data: [] as unknown[], error: null as null | { message: string } } },
  toast: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/integrations/supabase/client', () => {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) {
    b[m] = (...a: unknown[]) => {
      calls.push([m, a]);
      return b;
    };
  }
  b.order = (...a: unknown[]) => {
    calls.push(['order', a]);
    return Promise.resolve(result.value);
  };
  return { supabase: { from: (t: string) => (calls.push(['from', [t]]), b) } };
});

import { useUnifiedTags } from '../useUnifiedTags';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) =>
    createElement(TestProviders, { queryClient: qc, children });
const fresh = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('useUnifiedTags', () => {
  beforeEach(() => {
    calls.length = 0;
    toast.mockReset();
    auth.user = null;
    result.value = { data: [], error: null };
  });

  it('loads active tags, most-used first', async () => {
    result.value = { data: [{ id: 't1', name: 'Bear' }], error: null };
    const { result: r } = renderHook(() => useUnifiedTags(), { wrapper: wrap(fresh()) });
    expect(r.current.loading).toBe(true);
    await waitFor(() => expect(r.current.loading).toBe(false));
    expect(r.current.tags.map((t) => t.id)).toEqual(['t1']);
    expect(calls).toContainEqual(['from', ['unified_tags']]);
    expect(calls).toContainEqual(['eq', ['status', 'active']]);
    expect(calls).toContainEqual(['order', ['usage_count', { ascending: false }]]);
  });

  it('never selects long_description', async () => {
    renderHook(() => useUnifiedTags(), { wrapper: wrap(fresh()) });
    await waitFor(() => expect(calls.some(([m]) => m === 'select')).toBe(true));
    const select = calls.find(([m]) => m === 'select')![1][0] as string;
    expect(select).not.toContain('long_description');
    expect(select).not.toBe('*');
  });

  it('does not show one viewer the cached tags of another', async () => {
    const qc = fresh();
    auth.user = { id: 'u-1' };
    const first = renderHook(() => useUnifiedTags(), { wrapper: wrap(qc) });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();
    const before = calls.filter(([m]) => m === 'from').length;
    auth.user = null;
    renderHook(() => useUnifiedTags(), { wrapper: wrap(qc) });
    await waitFor(() => expect(calls.filter(([m]) => m === 'from').length).toBe(before + 1));
  });

  it('surfaces a failed load as an error and a toast', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    result.value = { data: null as unknown as unknown[], error: { message: 'boom' } };
    const { result: r } = renderHook(() => useUnifiedTags(), { wrapper: wrap(fresh()) });
    await waitFor(() => expect(r.current.error).toBe('boom'));
    expect(r.current.tags).toEqual([]);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'boom' }));
  });
});
