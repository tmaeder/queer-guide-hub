/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { useActivitySearch } from '../useActivitySearch';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { invokeMock.mockReset(); });

describe('useActivitySearch', () => {
  it('disabled when no city and no latitude', () => {
    renderHook(() => useActivitySearch({ city: null }), { wrapper });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('invokes activity-search and maps activities to BookingResult', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        activities: [
          { activityId: 'a1', title: 'Tour', price: 25, currency: 'EUR' },
        ],
      },
      error: null,
    });

    const { result } = renderHook(
      () => useActivitySearch({ city: 'Berlin', limit: 5 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.[0]).toMatchObject({
      id: 'gyg-a1',
      provider: 'getyourguide',
      title: 'Tour',
      price: 25,
    });
  });

  it('returns [] on edge error', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    const { result } = renderHook(
      () => useActivitySearch({ city: 'Berlin' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
