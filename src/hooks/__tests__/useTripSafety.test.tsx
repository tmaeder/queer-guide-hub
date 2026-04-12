import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => {
  const h: ProxyHandler<any> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) };
  return { supabase: { from: () => new Proxy(() => {}, h) } };
});

import { useTripSafety } from '../useTripSafety';
const w = () => { const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>; };

describe('useTripSafety', () => {
  it('should return safety data shape', () => {
    const { result } = renderHook(() => useTripSafety([]), { wrapper: w() });
    expect(result.current).toHaveProperty('countries');
    expect(result.current).toHaveProperty('overallRisk');
    expect(result.current).toHaveProperty('hasCriminalizedDestination');
    expect(result.current).toHaveProperty('crossBorderWarnings');
  });
});
