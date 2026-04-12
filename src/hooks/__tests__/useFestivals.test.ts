import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<object> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, handler)),
    apply: () => new Proxy(() => {}, handler),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler) } };
});

import { useFestivals } from '../useFestivals';

describe('useFestivals', () => {
  it('should start with empty festivals when autoFetch false', () => {
    const { result } = renderHook(() => useFestivals(false));
    expect(result.current.festivals).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('should expose fetch and CRUD methods', () => {
    const { result } = renderHook(() => useFestivals(false));
    expect(typeof result.current.fetchFestivals).toBe('function');
    expect(typeof result.current.createFestival).toBe('function');
    expect(typeof result.current.updateFestival).toBe('function');
    expect(typeof result.current.deleteFestival).toBe('function');
  });
});
