import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/integrations/supabase/client', () => {
  const h: ProxyHandler<object> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) };
  return { supabase: { from: () => new Proxy(() => {}, h) } };
});
import { useOptimizedProfileData } from '../useOptimizedProfileData';
const w = () => { const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>; };
describe('useOptimizedProfileData', () => {
  it('should return combined profile data', () => {
    const { result } = renderHook(() => useOptimizedProfileData(), { wrapper: w() });
    expect(result.current).toHaveProperty('profile');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('profileLoading');
  });
});
