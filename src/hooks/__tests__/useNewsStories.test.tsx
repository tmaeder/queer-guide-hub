/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedSupabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

import { useNewsStories } from '../useNewsStories';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useNewsStories', () => {
  it('returns query', () => {
    const { result } = renderHook(() => useNewsStories({ minArticles: 1, limit: 3 }), { wrapper });
    expect(result.current).toBeDefined();
  });
});
