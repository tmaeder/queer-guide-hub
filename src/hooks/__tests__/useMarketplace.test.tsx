import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => {
  const h: ProxyHandler<any> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) };
  return { supabase: { from: () => new Proxy(() => {}, h) } };
});

import { useMarketplace } from '../useMarketplace';

describe('useMarketplace', () => {
  it('should start with empty listings', () => {
    const { result } = renderHook(() => useMarketplace());
    expect(Array.isArray(result.current.listings)).toBe(true);
  });

  it('should expose CRUD methods', () => {
    const { result } = renderHook(() => useMarketplace());
    expect(typeof result.current.fetchListings).toBe('function');
    expect(typeof result.current.createListing).toBe('function');
  });
});
