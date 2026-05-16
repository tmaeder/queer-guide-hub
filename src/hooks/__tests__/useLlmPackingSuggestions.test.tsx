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

import { useLlmPackingSuggestions } from '../useLlmPackingSuggestions';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { invokeMock.mockReset(); });

describe('useLlmPackingSuggestions', () => {
  it('rejects when tripId missing', async () => {
    const { result } = renderHook(() => useLlmPackingSuggestions(undefined), { wrapper });
    await expect(result.current.mutateAsync()).rejects.toThrow('tripId required');
  });

  it('invokes packing-suggestions-llm with trip_id', async () => {
    invokeMock.mockResolvedValueOnce({ data: { categories: [], cached: false }, error: null });
    const { result } = renderHook(() => useLlmPackingSuggestions('t1'), { wrapper });
    await result.current.mutateAsync();
    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body).toEqual({ trip_id: 't1' });
  });

  it('propagates edge errors', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'rl' } });
    const { result } = renderHook(() => useLlmPackingSuggestions('t1'), { wrapper });
    await expect(result.current.mutateAsync()).rejects.toEqual({ message: 'rl' });
  });
});
