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
  },
}));

import {
  useFeedbackDuplicateSuggestions,
  buildDuplicateMap,
  useDismissDuplicateSuggestion,
  useMergeDuplicate,
} from '../useFeedbackDuplicates';

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
});

describe('buildDuplicateMap', () => {
  it('mirrors a→b and b→a entries', () => {
    const map = buildDuplicateMap([
      { id: 's1', a_id: 'A', b_id: 'B', similarity: 0.9, dismissed: false } as never,
      { id: 's2', a_id: 'A', b_id: 'C', similarity: 0.7, dismissed: false } as never,
    ]);

    expect(map.A.map(e => e.partnerId).sort()).toEqual(['B', 'C']);
    expect(map.B[0]).toEqual({ partnerId: 'A', suggestionId: 's1', similarity: 0.9 });
    expect(map.C[0].partnerId).toBe('A');
  });

  it('returns empty map for empty input', () => {
    expect(buildDuplicateMap([])).toEqual({});
  });
});

describe('useFeedbackDuplicateSuggestions', () => {
  it("queries feedback_duplicate_suggestions where dismissed=false, ordered by similarity desc", async () => {
    withResults({
      data: [{ id: 's1', a_id: 'A', b_id: 'B', similarity: 0.9, dismissed: false }],
      error: null,
    });

    const { result } = renderHook(() => useFeedbackDuplicateSuggestions(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const call = state.calls[0];
    expect(call.table).toBe('feedback_duplicate_suggestions');
    const eq = call.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['dismissed', false]);
    const order = call.chain.find(s => s.method === 'order');
    expect(order?.args[0]).toBe('similarity');
  });
});

describe('useDismissDuplicateSuggestion', () => {
  it('updates dismissed=true + dismissed_at on the suggestion id', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useDismissDuplicateSuggestion(), { wrapper });

    await result.current.mutateAsync('s1');

    const call = state.calls[0];
    const update = call.chain.find(s => s.method === 'update');
    const payload = update?.args[0] as Record<string, unknown>;
    expect(payload.dismissed).toBe(true);
    expect(typeof payload.dismissed_at).toBe('string');

    const eq = call.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['id', 's1']);
  });
});

describe('useMergeDuplicate', () => {
  it('marks duplicate_of on the dupe, then dismisses the suggestion', async () => {
    withResults({ data: null, error: null }, { data: null, error: null });

    const { result } = renderHook(() => useMergeDuplicate(), { wrapper });
    await result.current.mutateAsync({
      duplicateId: 'dup',
      canonicalId: 'canon',
      suggestionId: 's1',
    });

    expect(state.calls).toHaveLength(2);

    // Step 1: community_submissions update duplicate_of
    const updCall = state.calls[0];
    expect(updCall.table).toBe('community_submissions');
    const updatePayload = updCall.chain.find(s => s.method === 'update')?.args[0];
    expect(updatePayload).toEqual({ duplicate_of: 'canon' });

    // Step 2: dismiss the suggestion
    const dismissCall = state.calls[1];
    expect(dismissCall.table).toBe('feedback_duplicate_suggestions');
    expect((dismissCall.chain.find(s => s.method === 'update')?.args[0] as Record<string, unknown>).dismissed).toBe(true);
  });

  it('throws when the first update fails (does not dismiss)', async () => {
    withResults({ data: null, error: { message: 'rls' } });

    const { result } = renderHook(() => useMergeDuplicate(), { wrapper });
    await expect(
      result.current.mutateAsync({ duplicateId: 'd', canonicalId: 'c', suggestionId: 's1' }),
    ).rejects.toEqual({ message: 'rls' });

    expect(state.calls).toHaveLength(1);
  });
});
