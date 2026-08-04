import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { mockQueryResult } = vi.hoisted(() => ({
  mockQueryResult: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<object> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, handler)),
    apply: () => new Proxy(() => {}, handler),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler) } };
});

vi.mock('@/utils/fetchWithRetry', () => ({
  queryWithRetry: () => mockQueryResult(),
}));

import { useEvents } from '../useEvents';

describe('useEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryResult.mockResolvedValue({ data: [], error: null, count: 0 });
  });

  it('should auto-fetch when autoFetch is true', async () => {
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('should not auto-fetch when autoFetch is false', () => {
    const { result } = renderHook(() => useEvents(false));
    expect(result.current.loading).toBe(false);
    expect(result.current.events).toEqual([]);
  });

  it('should expose CRUD methods', () => {
    const { result } = renderHook(() => useEvents(false));
    expect(typeof result.current.fetchEvents).toBe('function');
    expect(typeof result.current.createEvent).toBe('function');
    expect(typeof result.current.updateEvent).toBe('function');
    expect(typeof result.current.deleteEvent).toBe('function');
  });

  it('returns the total from the query it just ran, not a stale one', async () => {
    // `fetchEvents` is memoised with an empty dep array on purpose, so anything
    // it reads out of component state is frozen at first render. It used to
    // return the `totalCount` state that way, which made `total` null on the
    // first call and one query behind on every call after it — while the real
    // count sat in the same scope, on its way into that very setter. Two calls
    // with different counts is what separates "reads the fresh value" from
    // "happened to match once".
    const { result } = renderHook(() => useEvents(false));

    mockQueryResult.mockResolvedValue({ data: [], error: null, count: 42 });
    const first = await result.current.fetchEvents();
    expect(first.total).toBe(42);

    mockQueryResult.mockResolvedValue({ data: [], error: null, count: 7 });
    const second = await result.current.fetchEvents();
    expect(second.total).toBe(7);
  });

  it('should handle fetch error', async () => {
    mockQueryResult.mockResolvedValue({ data: null, error: new Error('fail'), count: null });
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });
});
