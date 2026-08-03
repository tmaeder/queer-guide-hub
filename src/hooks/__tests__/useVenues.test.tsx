import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { mockQueryResult, mockFrom } = vi.hoisted(() => ({
  mockQueryResult: vi.fn(),
  mockFrom: vi.fn(),
}));

// Create a chainable mock that returns itself for any method call,
// except the final call returns the mock result
function createChainableMock(): unknown {
  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      if (prop === 'then') return undefined; // Not a promise
      return (..._args: unknown[]) => new Proxy(() => {}, handler);
    },
    apply: () => new Proxy(() => {}, handler),
  };
  return new Proxy(() => {}, handler);
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => {
      mockFrom(...args);
      return createChainableMock();
    },
  },
}));

vi.mock('@/utils/fetchWithRetry', () => ({
  queryWithRetry: () => mockQueryResult(),
}));

import { useVenues } from '../useVenues';

describe('useVenues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryResult.mockResolvedValue({ data: [], error: null, count: 0 });
  });

  it('should auto-fetch when autoFetch is true', async () => {
    const { result } = renderHook(() => useVenues(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('should not auto-fetch when autoFetch is false', () => {
    const { result } = renderHook(() => useVenues(false));
    expect(result.current.loading).toBe(false);
    expect(result.current.venues).toEqual([]);
  });

  it('should expose fetch, create, update, delete methods', () => {
    const { result } = renderHook(() => useVenues(false));
    expect(typeof result.current.fetchVenues).toBe('function');
    expect(typeof result.current.createVenue).toBe('function');
    expect(typeof result.current.updateVenue).toBe('function');
    expect(typeof result.current.deleteVenue).toBe('function');
  });

  it('should start with empty venues', () => {
    const { result } = renderHook(() => useVenues(false));
    expect(result.current.venues).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  // The dataset-total probe is an unfiltered COUNT(*) over ~19k rows. It used
  // to fire on every mount regardless of autoFetch, so the map — which never
  // reads datasetTotal — paid for it on each visit.
  it('runs the dataset-total count on mount by default', async () => {
    renderHook(() => useVenues(false));
    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('venues'));
  });

  it('skips the dataset-total count when skipDatasetTotal is set', async () => {
    renderHook(() => useVenues(false, { skipDatasetTotal: true }));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('should handle fetch error', async () => {
    mockQueryResult.mockResolvedValue({ data: null, error: new Error('DB error'), count: null });
    const { result } = renderHook(() => useVenues(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });
});
