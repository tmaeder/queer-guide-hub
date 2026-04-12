import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDynamicSitemap } from '../useDynamicSitemap';

const makeWrapper = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe('useDynamicSitemap', () => {
  it('should return sitemap sections', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    const { result } = renderHook(() => useDynamicSitemap(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
    expect(result.current.data!.length).toBeGreaterThanOrEqual(2);
    const explore = result.current.data!.find(s => s.title === 'Explore');
    expect(explore).toBeDefined();
    expect(explore!.links.some(l => l.to === '/venues')).toBe(true);
    vi.restoreAllMocks();
  });
});
