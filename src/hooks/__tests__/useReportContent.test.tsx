import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { useReportContent } from '../useReportContent';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
};

beforeEach(() => rpc.mockReset());

describe('useReportContent', () => {
  it('maps the report to the RPC and trims empty details to undefined', async () => {
    rpc.mockResolvedValue({ data: 'flag-1', error: null });
    const { result } = renderHook(() => useReportContent(), { wrapper });

    await result.current.mutateAsync({
      contentType: 'community_post',
      contentId: 'post-1',
      reason: 'Spam or scam',
      details: '   ',
    });

    expect(rpc).toHaveBeenCalledWith('report_content', {
      p_content_type: 'community_post',
      p_content_id: 'post-1',
      p_reason: 'Spam or scam',
      p_details: undefined,
    });
  });

  it('forwards trimmed details when provided', async () => {
    rpc.mockResolvedValue({ data: 'flag-2', error: null });
    const { result } = renderHook(() => useReportContent(), { wrapper });
    await result.current.mutateAsync({
      contentType: 'post_comment',
      contentId: 'c-1',
      reason: 'Harassment or hate',
      details: '  threatening dms  ',
    });
    expect(rpc).toHaveBeenCalledWith('report_content', {
      p_content_type: 'post_comment',
      p_content_id: 'c-1',
      p_reason: 'Harassment or hate',
      p_details: 'threatening dms',
    });
  });

  it('throws on RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const { result } = renderHook(() => useReportContent(), { wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());
    await expect(
      result.current.mutateAsync({ contentType: 'profile', contentId: 'u-1', reason: 'Other' }),
    ).rejects.toBeTruthy();
  });
});
