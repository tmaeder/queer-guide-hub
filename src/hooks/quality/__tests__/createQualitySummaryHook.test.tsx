/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createQualitySummaryHook } from '../createQualitySummaryHook';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('createQualitySummaryHook', () => {
  it('fans out metrics, coerces count/rows/single, and reshapes', async () => {
    const calls: string[] = [];
    const useSummary = createQualitySummaryHook({
      queryKey: 'test-summary',
      metrics: {
        open: {
          kind: 'count',
          build: () => {
            calls.push('open');
            return Promise.resolve({ count: 7 });
          },
        },
        nullCount: { kind: 'count', build: () => Promise.resolve({ count: null }) },
        rows: { kind: 'rows', build: () => Promise.resolve({ data: [{ id: 1 }, { id: 2 }] }) },
        emptyRows: { kind: 'rows', build: () => Promise.resolve({ data: null }) },
        last: { kind: 'single', build: () => Promise.resolve({ data: { status: 'ok' } }) },
        missing: { kind: 'single', build: () => Promise.resolve({ data: undefined }) },
      },
      reshape: (r) => ({
        open: r.open,
        nullCount: r.nullCount,
        rowCount: r.rows.length,
        emptyRowCount: r.emptyRows.length,
        lastStatus: (r.last as { status: string } | null)?.status ?? null,
        missing: r.missing,
      }),
    });

    const { result } = renderHook(() => useSummary(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      open: 7,
      nullCount: 0,
      rowCount: 2,
      emptyRowCount: 0,
      lastStatus: 'ok',
      missing: null,
    });
    expect(calls).toEqual(['open']);
  });
});
