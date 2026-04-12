import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => {
  const h: ProxyHandler<object> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) };
  return { supabase: { from: () => new Proxy(() => {}, h) } };
});

import { useTripBudget } from '../useTripBudget';
const w = () => { const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>; };

describe('useTripBudget', () => {
  it('should return budget data and mutations', () => {
    const { result } = renderHook(() => useTripBudget('trip-1'), { wrapper: w() });
    expect(result.current).toHaveProperty('items');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('summary');
  });
});
