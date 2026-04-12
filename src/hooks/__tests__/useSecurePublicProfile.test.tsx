import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/integrations/supabase/client', () => {
  const h: ProxyHandler<object> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) };
  return { supabase: { from: () => new Proxy(() => {}, h) } };
});
import { useSecurePublicProfile } from '../useSecurePublicProfile';
describe('useSecurePublicProfile', () => {
  it('should expose profile and helpers', () => {
    const { result } = renderHook(() => useSecurePublicProfile('u-1'));
    expect(result.current).toHaveProperty('profile');
    expect(result.current).toHaveProperty('loading');
    expect(typeof result.current.canViewSensitiveField).toBe('function');
    expect(result.current.isOwnProfile).toBe(true);
  });
});
