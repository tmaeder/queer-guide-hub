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

import { useReplyToFeedback } from '../useFeedbackReply';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { invokeMock.mockReset(); });

describe('useReplyToFeedback', () => {
  it('invokes reply-to-feedback and mirrors to GitHub (fire-and-forget)', async () => {
    invokeMock
      .mockResolvedValueOnce({ data: { success: true, reply: {} }, error: null }) // reply-to-feedback
      .mockResolvedValueOnce({ data: null, error: null }); // push-feedback-to-github

    const { result } = renderHook(() => useReplyToFeedback(), { wrapper });
    await result.current.mutateAsync({ submissionId: 's1', body: 'thanks', notify: true });

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock.mock.calls[0][0]).toBe('reply-to-feedback');
    expect(invokeMock.mock.calls[1][0]).toBe('push-feedback-to-github');
    expect(invokeMock.mock.calls[0][1].body).toEqual({
      submission_id: 's1',
      body: 'thanks',
      notify: true,
    });
  });

  it('throws on reply-to-feedback edge error', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    const { result } = renderHook(() => useReplyToFeedback(), { wrapper });
    await expect(
      result.current.mutateAsync({ submissionId: 's1', body: 'x', notify: false }),
    ).rejects.toEqual({ message: 'down' });
  });
});
