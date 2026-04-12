import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { mockQueryResult } = vi.hoisted(() => ({
  mockQueryResult: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<any> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, handler)),
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

  it('should handle fetch error', async () => {
    mockQueryResult.mockResolvedValue({ data: null, error: new Error('fail'), count: null });
    const { result } = renderHook(() => useEvents(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });
});
