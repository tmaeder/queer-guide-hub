import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'viewer-1' } }) }));

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { usePeopleDiscovery, useCompatibility } from '../usePeopleDiscovery';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
};

beforeEach(() => rpc.mockReset());

describe('usePeopleDiscovery', () => {
  it('passes the viewer + mode + context to the RPC and maps the rows', async () => {
    rpc.mockResolvedValue({
      data: [
        { user_id: 'a', score: 80, shared: { mutual_friends: 2 } },
        { user_id: 'b', score: 50, shared: null },
      ],
      error: null,
    });

    const { result } = renderHook(
      () => usePeopleDiscovery({ mode: 'locals', cityId: 'city-1', limit: 8 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('people_discovery', {
      p_viewer: 'viewer-1',
      p_mode: 'locals',
      p_city_id: 'city-1',
      p_event_id: undefined,
      p_trip_id: undefined,
      p_limit: 8,
    });
    expect(result.current.data).toEqual([
      { userId: 'a', score: 80, shared: { mutual_friends: 2 } },
      { userId: 'b', score: 50, shared: {} },
    ]);
  });

  it('stays disabled when explicitly disabled (no RPC call)', () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderHook(() => usePeopleDiscovery({ mode: 'dating', enabled: false }), { wrapper });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('useCompatibility', () => {
  it('does not query without a candidate', () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    renderHook(() => useCompatibility(null), { wrapper });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns the single-pair score', async () => {
    rpc.mockResolvedValue({ data: 73, error: null });
    const { result } = renderHook(() => useCompatibility('cand-9'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('compute_compatibility', {
      p_viewer: 'viewer-1',
      p_candidate: 'cand-9',
    });
    expect(result.current.data).toBe(73);
  });
});
