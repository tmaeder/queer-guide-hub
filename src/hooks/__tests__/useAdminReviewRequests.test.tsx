import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'staff' } }) }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedSupabase: { rpc: mocks.rpc },
  untypedRpc: vi.fn(),
  untypedFrom: vi.fn(),
}));
vi.mock('@/hooks/useSearchIntelligence', () => ({
  callSearchIntelligence: vi.fn(),
  createTagFromProposal: vi.fn(),
}));
import { useAdminReview, useAdminReviewSummary } from '../useAdminReview';

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
describe('review requests', () => {
  beforeEach(() => vi.clearAllMocks());
  it('loads sidebar counts without fetching or hydrating a queue page', async () => {
    const summary = {
      decisions_total: 12,
      all_total: 20,
      sources: [],
      updated_at: '2026-10-13T00:00:00Z',
    };
    const abortSignal = vi.fn().mockResolvedValue({ data: summary, error: null });
    mocks.rpc.mockReturnValue({ abortSignal });
    const { result } = renderHook(() => useAdminReviewSummary(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(summary));
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('get_admin_review_work_summary');
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it('cancels a queue request when its workspace unmounts', async () => {
    let captured: AbortSignal | undefined;
    mocks.rpc.mockReturnValue({
      abortSignal: (signal: AbortSignal) => {
        captured = signal;
        return new Promise(() => {});
      },
    });
    const { unmount } = renderHook(
      () =>
        useAdminReview({ queues: null, search: '', scope: 'decisions', sort: 'priority', page: 1 }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(captured).toBeDefined());
    expect(captured?.aborted).toBe(false);
    unmount();
    expect(captured?.aborted).toBe(true);
  });
  it('shares queue totals with the sidebar without issuing a second request', async () => {
    const page = {
      items: [],
      total: 12,
      all_total: 20,
      decisions_total: 12,
      findings_total: 8,
      overdue_total: 2,
      safety_total: 1,
      sources: [],
      updated_at: '2026-10-13T00:00:00Z',
      page: 1,
      per_page: 50,
    };
    mocks.rpc.mockReturnValue({
      abortSignal: vi.fn().mockResolvedValue({ data: page, error: null }),
    });
    const { result } = renderHook(
      () => ({
        queue: useAdminReview({
          queues: null,
          search: '',
          scope: 'decisions',
          sort: 'priority',
          page: 1,
        }),
        sidebar: useAdminReviewSummary(false),
      }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.sidebar.data?.decisions_total).toBe(12));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][0]).toBe('get_admin_review_queue');
  });
  it('cancels a pending sidebar summary when entering the queue workspace', async () => {
    let captured: AbortSignal | undefined;
    mocks.rpc.mockReturnValue({
      abortSignal: (signal: AbortSignal) => {
        captured = signal;
        return new Promise(() => {});
      },
    });
    const { rerender } = renderHook(({ enabled }) => useAdminReviewSummary(enabled), {
      wrapper: Wrapper,
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(captured).toBeDefined());
    rerender({ enabled: false });
    await waitFor(() => expect(captured?.aborted).toBe(true));
  });
});
