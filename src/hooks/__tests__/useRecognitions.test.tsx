/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string; code?: string } | null };
const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  calls: [] as Array<{ table?: string; rpc?: string; chain: Array<{ method: string; args: unknown[] }> }>,
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
    rpc(name: string, args: unknown) {
      state.calls.push({ rpc: name, chain: [{ method: 'rpc', args: [name, args] }] });
      const next = state.results.shift() ?? { data: null, error: null };
      return Promise.resolve(next);
    },
  },
}));

import {
  usePublicRecognitions,
  useAdminRecognitions,
  useContributionMetrics,
  useMailingAddress,
} from '../useRecognitions';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('usePublicRecognitions', () => {
  it('queries contributor_recognitions_public filtered to year', async () => {
    withResults({ data: [{ id: 'r1' }], error: null });
    const { result } = renderHook(() => usePublicRecognitions(2026), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(state.calls[0].table).toBe('contributor_recognitions_public');
    expect(state.calls[0].chain.find(s => s.method === 'eq')?.args).toEqual(['year', 2026]);
    expect(result.current.data?.rows.length).toBe(1);
  });

  it("returns empty rows when table is missing (PGRST205)", async () => {
    withResults({ data: null, error: { code: 'PGRST205', message: 'no such table' } });
    const { result } = renderHook(() => usePublicRecognitions(2026), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual({ rows: [], error: null });
  });

  it('surfaces non-missing errors as the error string', async () => {
    withResults({ data: null, error: { code: 'OTHER', message: 'rls denied' } });
    const { result } = renderHook(() => usePublicRecognitions(2026), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.error).toBe('rls denied');
  });
});

describe('useAdminRecognitions', () => {
  it('queries contributor_recognitions filtered by year', async () => {
    withResults({ data: [{ id: 'r1', year: 2026 }], error: null });
    const { result } = renderHook(() => useAdminRecognitions(2026), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(state.calls[0].table).toBe('contributor_recognitions');
    expect(result.current.data?.[0].id).toBe('r1');
  });

  it('throws on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useAdminRecognitions(2026), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useContributionMetrics', () => {
  it('calls contribution_metrics_for_year RPC', async () => {
    withResults({ data: [{ user_id: 'u1', accepted_submissions: 5 }], error: null });
    const { result } = renderHook(() => useContributionMetrics(2026), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(state.calls[0].rpc).toBe('contribution_metrics_for_year');
    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args.p_year).toBe(2026);
  });
});

describe('useMailingAddress', () => {
  it('is disabled without userId', () => {
    renderHook(() => useMailingAddress(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it("returns missingTable=true when PGRST205", async () => {
    withResults({ data: null, error: { code: 'PGRST205', message: 'no such table' } });
    const { result } = renderHook(() => useMailingAddress('u1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.missingTable).toBe(true);
    expect(result.current.data?.row).toBeNull();
  });

  it('returns the row when present', async () => {
    withResults({
      data: { recipient: 'Alice', line1: '1 Test', city: 'Berlin', country_code: 'DE' },
      error: null,
    });
    const { result } = renderHook(() => useMailingAddress('u1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.row?.city).toBe('Berlin');
    expect(result.current.data?.missingTable).toBe(false);
  });
});
