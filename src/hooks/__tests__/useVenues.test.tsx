import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { mockQueryResult } = vi.hoisted(() => ({
  mockQueryResult: vi.fn(),
}));

// Create a chainable mock that returns itself for any method call,
// except the final call returns the mock result
function createChainableMock(): any {
  const handler: ProxyHandler<any> = {
    get: (_target, prop) => {
      if (prop === 'then') return undefined; // Not a promise
      return (..._args: any[]) => new Proxy(() => {}, handler);
    },
    apply: () => new Proxy(() => {}, handler),
  };
  return new Proxy(() => {}, handler);
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => createChainableMock(),
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

  it('should handle fetch error', async () => {
    mockQueryResult.mockResolvedValue({ data: null, error: new Error('DB error'), count: null });
    const { result } = renderHook(() => useVenues(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });
});
