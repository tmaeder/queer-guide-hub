/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedSupabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

import { useFootprintStats, useFootprintReturnNudge } from '../useFootprintStats';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useFootprintStats', () => {
  it('useFootprintStats returns query', () => {
    const { result } = renderHook(() => useFootprintStats(), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('useFootprintReturnNudge returns query', () => {
    const { result } = renderHook(() => useFootprintReturnNudge(), { wrapper });
    expect(result.current).toBeDefined();
  });
});
