/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { rpcMock, useAuthMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: rpcMock },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import { useEventSocialSignals } from '../useEventSocialSignals';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  rpcMock.mockReset();
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: null });
});

describe('useEventSocialSignals', () => {
  it('is disabled when venueIds is empty', () => {
    renderHook(() => useEventSocialSignals([]), { wrapper });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('is disabled when venueIds is undefined', () => {
    renderHook(() => useEventSocialSignals(undefined), { wrapper });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('calls get_event_social_signals RPC with sorted ids and viewer id', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    rpcMock.mockResolvedValueOnce({
      data: [
        { event_id: 'v1', friends_going: 2, attending_count: 5 },
        { event_id: 'v2', friends_going: 0, attending_count: 1 },
      ],
      error: null,
    });

    const { result } = renderHook(() => useEventSocialSignals(['v2', 'v1']), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(rpcMock).toHaveBeenCalledWith('get_event_social_signals', {
      p_event_ids: ['v1', 'v2'],
      p_viewer_id: 'u1',
    });

    const map = result.current.data!;
    expect(map.get('v1')?.friends_going).toBe(2);
    expect(map.get('v2')?.attending_count).toBe(1);
  });

  it('does not call the RPC when signed out (anon has no EXECUTE → 401)', async () => {
    const { result } = renderHook(() => useEventSocialSignals(['v1']), { wrapper });
    // positive control: the query exists and is idle, not merely pending a call
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('throws on RPC error', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    const { result } = renderHook(() => useEventSocialSignals(['v1']), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
