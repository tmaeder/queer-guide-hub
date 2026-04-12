import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<any> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, handler)),
    apply: () => new Proxy(() => {}, handler),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler) } };
});

import { useHotels } from '../useHotels';

describe('useHotels', () => {
  it('should start with empty hotels when autoFetch false', () => {
    const { result } = renderHook(() => useHotels(false));
    expect(result.current.hotels).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('should expose CRUD methods', () => {
    const { result } = renderHook(() => useHotels(false));
    expect(typeof result.current.fetchHotels).toBe('function');
    expect(typeof result.current.createHotel).toBe('function');
    expect(typeof result.current.updateHotel).toBe('function');
    expect(typeof result.current.deleteHotel).toBe('function');
  });

  it('should track hasMore and totalCount', () => {
    const { result } = renderHook(() => useHotels(false));
    expect(result.current.hasMore).toBe(true);
    expect(result.current.totalCount).toBe(0);
  });
});
