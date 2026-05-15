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

import { useVenueSocialSignals } from '../useVenueSocialSignals';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  rpcMock.mockReset();
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: null });
});

describe('useVenueSocialSignals', () => {
  it('is disabled when venueIds is empty', () => {
    renderHook(() => useVenueSocialSignals([]), { wrapper });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('is disabled when venueIds is undefined', () => {
    renderHook(() => useVenueSocialSignals(undefined), { wrapper });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('calls get_venue_social_signals RPC with sorted ids and viewer id', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    rpcMock.mockResolvedValueOnce({
      data: [
        { venue_id: 'v1', friends_saved: 2, trip_usage: 5 },
        { venue_id: 'v2', friends_saved: 0, trip_usage: 1 },
      ],
      error: null,
    });

    const { result } = renderHook(
      () => useVenueSocialSignals(['v2', 'v1']),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(rpcMock).toHaveBeenCalledWith('get_venue_social_signals', {
      p_venue_ids: ['v1', 'v2'],
      p_viewer_id: 'u1',
    });

    const map = result.current.data!;
    expect(map.get('v1')?.friends_saved).toBe(2);
    expect(map.get('v2')?.trip_usage).toBe(1);
  });

  it('passes null viewer id when signed out', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    renderHook(() => useVenueSocialSignals(['v1']), { wrapper });
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());

    expect(rpcMock.mock.calls[0][1]).toEqual({
      p_venue_ids: ['v1'],
      p_viewer_id: null,
    });
  });

  it('throws on RPC error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    const { result } = renderHook(() => useVenueSocialSignals(['v1']), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
