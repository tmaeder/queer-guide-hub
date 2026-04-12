import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/integrations/supabase/client', () => {
  const h: ProxyHandler<object> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) };
  return { supabase: { from: () => new Proxy(() => {}, h) } };
});

import { useUserEvents } from '../useUserEvents';

describe('useUserEvents', () => {
  it('should start loading', () => {
    const { result } = renderHook(() => useUserEvents());
    expect(result.current.loading).toBe(true);
  });

  it('should expose refetch', () => {
    const { result } = renderHook(() => useUserEvents());
    expect(typeof result.current.refetch).toBe('function');
  });
});
