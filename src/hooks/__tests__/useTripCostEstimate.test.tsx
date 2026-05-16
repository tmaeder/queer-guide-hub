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

import { useCostEstimate } from '../useTripCostEstimate';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { invokeMock.mockReset(); });

describe('useCostEstimate', () => {
  it('invokes trip-cost-estimate with party_size default 1', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { currency: 'EUR', party_size: 1, suggestions: [] },
      error: null,
    });
    const { result } = renderHook(() => useCostEstimate(), { wrapper });
    const out = await result.current.mutateAsync({ tripId: 't1' });
    expect(out.party_size).toBe(1);
    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body).toEqual({ trip_id: 't1', party_size: 1 });
  });

  it('honors partySize override', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { currency: 'EUR', party_size: 4, suggestions: [] },
      error: null,
    });
    const { result } = renderHook(() => useCostEstimate(), { wrapper });
    await result.current.mutateAsync({ tripId: 't1', partySize: 4 });
    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body.party_size).toBe(4);
  });

  it("throws 'empty response' when data is null", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useCostEstimate(), { wrapper });
    await expect(result.current.mutateAsync({ tripId: 't1' })).rejects.toThrow('empty response');
  });

  it('propagates edge errors', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    const { result } = renderHook(() => useCostEstimate(), { wrapper });
    await expect(result.current.mutateAsync({ tripId: 't1' })).rejects.toEqual({ message: 'down' });
  });
});
