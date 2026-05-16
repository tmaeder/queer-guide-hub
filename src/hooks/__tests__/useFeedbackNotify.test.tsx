/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { useNotifyFeedbackStatus } from '../useFeedbackNotify';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { invokeMock.mockReset(); });

describe('useNotifyFeedbackStatus', () => {
  it('invokes notify-feedback-status with submission_id + event', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useNotifyFeedbackStatus(), { wrapper });
    await result.current.mutateAsync({ submissionId: 's1', event: 'resolved' });

    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body).toEqual({ submission_id: 's1', event: 'resolved' });
  });

  it('includes new_status when provided', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useNotifyFeedbackStatus(), { wrapper });
    await result.current.mutateAsync({ submissionId: 's1', event: 'status_changed', newStatus: 'doing' });

    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body.new_status).toBe('doing');
  });

  it('throws on edge error', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    const { result } = renderHook(() => useNotifyFeedbackStatus(), { wrapper });
    await expect(
      result.current.mutateAsync({ submissionId: 's1', event: 'resolved' }),
    ).rejects.toEqual({ message: 'fail' });
  });
});
