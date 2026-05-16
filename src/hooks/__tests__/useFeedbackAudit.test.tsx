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

import { useFeedbackAudit } from '../useFeedbackAudit';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('useFeedbackAudit', () => {
  it('is disabled without submissionId', () => {
    renderHook(() => useFeedbackAudit(null), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('queries community_submissions_audit filtered by submission_id', async () => {
    withResults({ data: [{ id: 'a1' }], error: null });
    const { result } = renderHook(() => useFeedbackAudit('s1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(state.calls[0].table).toBe('community_submissions_audit');
    expect(state.calls[0].chain.find(s => s.method === 'eq')?.args).toEqual(['submission_id', 's1']);
    expect(state.calls[0].chain.find(s => s.method === 'limit')?.args).toEqual([50]);
  });
});
