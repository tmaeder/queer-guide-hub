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
      const builder: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (onFulfilled: (v: MockResult) => unknown) => {
              const next = state.results.shift() ?? { data: null, error: null };
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

import { useEntityData, useStagingData } from '../useTriageDetail';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

function makeItem(over: Partial<{ entity_id: string | null; entity_table: string | null; queue_type: string }> = {}) {
  return {
    id: 'i1', queue_type: 'review', content_type: 'venue', title: 't', subtitle: 's',
    status: 'pending', confidence_score: null, created_at: '', source: 's',
    entity_id: 'e1', entity_table: 'venues', has_diff: false, reporter_id: null,
    meta: {}, ...over,
  };
}

describe('useEntityData', () => {
  it('is disabled without entity_id or entity_table', () => {
    renderHook(() => useEntityData(makeItem({ entity_id: null })), { wrapper });
    renderHook(() => useEntityData(makeItem({ entity_table: null })), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('returns null for non-allowlisted tables (no query)', async () => {
    withResults({ data: { id: 'x' }, error: null });
    const { result } = renderHook(
      () => useEntityData(makeItem({ entity_table: 'secret_table' })),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Query fires .from(table) but returns null before reading data.
    expect(result.current.data).toBeNull();
  });

  it('queries allowlisted tables by id', async () => {
    withResults({ data: { id: 'v1', name: 'Berghain' }, error: null });
    const { result } = renderHook(
      () => useEntityData(makeItem({ entity_table: 'venues' })),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual({ id: 'v1', name: 'Berghain' });
    expect(state.calls[0].table).toBe('venues');
    expect(state.calls[0].chain.find(s => s.method === 'eq')?.args).toEqual(['id', 'e1']);
  });

  it('returns null on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(
      () => useEntityData(makeItem({ entity_table: 'venues' })),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useStagingData', () => {
  it('is disabled when queue_type !== "staging"', () => {
    renderHook(() => useStagingData(makeItem({ queue_type: 'review' })), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('queries ingestion_staging when queue_type=staging', async () => {
    withResults({ data: { raw_data: {}, normalized_data: {} }, error: null });
    const { result } = renderHook(
      () => useStagingData(makeItem({ queue_type: 'staging' })),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(state.calls[0].table).toBe('ingestion_staging');
    expect(state.calls[0].chain.find(s => s.method === 'eq')?.args).toEqual(['id', 'i1']);
  });
});
