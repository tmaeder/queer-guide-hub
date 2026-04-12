import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => {
  const handler: ProxyHandler<any> = {
    get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, handler)),
    apply: () => new Proxy(() => {}, handler),
  };
  return { supabase: { from: () => new Proxy(() => {}, handler) } };
});

import { useUserRoles } from '../useUserRoles';

const w = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useUserRoles', () => {
  it('should return query result shape', () => {
    const { result } = renderHook(() => useUserRoles(), { wrapper: w() });
    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('isLoading');
  });
});
