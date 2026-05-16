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

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      const builder: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (onFulfilled: (v: MockResult) => unknown) => {
              const next = state.results.shift() ?? { data: [], error: null };
              return Promise.resolve(next).then(onFulfilled);
            };
          }
          return (...args: unknown[]) => { record.chain.push({ method: prop, args }); return builder; };
        },
      });
      return builder;
    },
  },
}));

import {
  usePendingTagSuggestions,
  fetchAllPendingTagSuggestionIds,
  rejectTagSuggestions,
} from '../useTagSuggestionsQueue';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('usePendingTagSuggestions', () => {
  it('queries tag_suggestions filtered to pending', async () => {
    withResults({ data: [{ id: 't1' }], error: null, count: 1 });
    const { result } = renderHook(() => usePendingTagSuggestions(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.total).toBe(1);
    expect(state.calls[0].chain.find(s => s.method === 'eq')?.args).toEqual(['status', 'pending']);
  });
});

describe('fetchAllPendingTagSuggestionIds', () => {
  it('returns just ids', async () => {
    withResults({ data: [{ id: 't1' }, { id: 't2' }], error: null });
    const r = await fetchAllPendingTagSuggestionIds();
    expect(r).toEqual(['t1', 't2']);
  });
});

describe('rejectTagSuggestions', () => {
  it('updates status=rejected on .in("id", ids)', async () => {
    withResults({ data: null, error: null });
    const n = await rejectTagSuggestions(['t1', 't2'], 'u1');
    expect(n).toBe(2);

    const update = state.calls[0].chain.find(s => s.method === 'update');
    const payload = update?.args[0] as Record<string, unknown>;
    expect(payload.status).toBe('rejected');
    expect(payload.reviewed_by).toBe('u1');
    expect(state.calls[0].chain.find(s => s.method === 'in')?.args).toEqual(['id', ['t1', 't2']]);
  });

  it('throws on error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    await expect(rejectTagSuggestions(['t1'], 'u1')).rejects.toEqual({ message: 'rls' });
  });
});
