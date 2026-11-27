import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
import { useTravelDeals } from '../useTravelDeals';
function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}
beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { deals: [] }, error: null });
});
describe('useTravelDeals', () => {
  it('does not fetch without an origin', () => {
    renderHook(() => useTravelDeals({ origin: null }), { wrapper: wrapper() });
    expect(invoke).not.toHaveBeenCalled();
  });
  it('sends dates and uses separate cached results when dates change', async () => {
    const { result, rerender } = renderHook(
      ({ date }) =>
        useTravelDeals({
          origin: 'ZRH',
          destination: 'BER',
          departureDate: date,
          returnDate: '2027-01-20',
        }),
      { wrapper: wrapper(), initialProps: { date: '2027-01-14' } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invoke).toHaveBeenLastCalledWith('travel-deals', {
      body: expect.objectContaining({ departureDate: '2027-01-14', returnDate: '2027-01-20' }),
    });
    rerender({ date: '2027-01-15' });
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke).toHaveBeenLastCalledWith('travel-deals', {
      body: expect.objectContaining({ departureDate: '2027-01-15' }),
    });
  });
  it('exposes failure and supports an explicit successful retry', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    const { result } = renderHook(() => useTravelDeals({ origin: 'ZRH' }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invoke).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });
});
