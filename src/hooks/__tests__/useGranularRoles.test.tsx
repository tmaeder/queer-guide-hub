import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/integrations/supabase/client', () => {
  const h: ProxyHandler<any> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) };
  return { supabase: { from: () => new Proxy(() => {}, h) } };
});
import { useGranularRoles } from '../useGranularRoles';
describe('useGranularRoles', () => {
  it('should expose permission functions', () => {
    const { result } = renderHook(() => useGranularRoles());
    expect(typeof result.current.can).toBe('function');
    expect(typeof result.current.canAccess).toBe('function');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('effectiveRole');
  });
});
