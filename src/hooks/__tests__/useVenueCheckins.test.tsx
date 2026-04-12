import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<any> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, handler)),
    apply: () => new Proxy(() => {}, handler),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler) } };
});

import { useVenueCheckins } from '../useVenueCheckins';

describe('useVenueCheckins', () => {
  it('should return expected shape', () => {
    const { result } = renderHook(() => useVenueCheckins());
    expect(result.current).toHaveProperty('loading');
    expect(typeof result.current.checkInAtVenue).toBe('function');
    expect(typeof result.current.getVenueCheckins).toBe('function');
    expect(typeof result.current.getUserCheckins).toBe('function');
  });

  it('should start not loading', () => {
    const { result } = renderHook(() => useVenueCheckins());
    expect(result.current.loading).toBe(false);
  });
});
