import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
vi.mock('@/integrations/supabase/client', () => {
  const h: ProxyHandler<any> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) };
  return { supabase: { from: () => new Proxy(() => {}, h) } };
});
import { useAdminTableQuery } from '../useAdminTableQuery';
const w = () => { const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>; };
describe('useAdminTableQuery', () => {
  it('should return data array and totalCount', () => {
    const { result } = renderHook(() => useAdminTableQuery({ table: 'venues', select: '*', state: { page: 0, pageSize: 10, search: '', debouncedSearch: '', filters: {}, sorting: [], selectedRows: new Set(), columnVisibility: {}, grouping: null } }), { wrapper: w() });
    expect(result.current.data).toEqual([]);
    expect(result.current.totalCount).toBe(0);
    expect(result.current).toHaveProperty('isLoading');
    expect(typeof result.current.refetch).toBe('function');
  });
});
