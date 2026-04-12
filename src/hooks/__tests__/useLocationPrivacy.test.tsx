import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => {
  const h: ProxyHandler<any> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) };
  return { supabase: { from: () => new Proxy(() => {}, h) } };
});
import { useLocationPrivacy } from '../useLocationPrivacy';
describe('useLocationPrivacy', () => {
  it('should expose privacy controls', () => {
    const { result } = renderHook(() => useLocationPrivacy());
    expect(result.current).toHaveProperty('locationSettings');
    expect(result.current).toHaveProperty('loading');
    expect(typeof result.current.updateLocationSettings).toBe('function');
    expect(typeof result.current.getPrivacyPreservingLocation).toBe('function');
    expect(typeof result.current.isLocationAnonymized).toBe('function');
  });
});
