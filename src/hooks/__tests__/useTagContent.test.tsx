import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: { venues: [], news: [], events: [], personalities: [], groups: [] }, error: null }) },
}));
import { useTagContent } from '../useTagContent';
const w = () => { const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>; };
describe('useTagContent', () => {
  it('should not fetch when no tagId', () => {
    const { result } = renderHook(() => useTagContent(undefined, undefined), { wrapper: w() });
    expect(result.current.isFetching).toBe(false);
  });
  it('should return query shape with tagId', () => {
    const { result } = renderHook(() => useTagContent('tag-1', 'lgbtq'), { wrapper: w() });
    expect(result.current).toHaveProperty('data');
    expect(result.current).toHaveProperty('isLoading');
  });
});
