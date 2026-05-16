/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) },
}));

import { useViewportPoints, POINT_LAYER_TYPES } from '../useViewportPoints';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useViewportPoints', () => {
  it('returns shape', () => {
    const { result } = renderHook(() => useViewportPoints({
      enabledLayers: [], viewport: { bbox: null, zoom: 5 }, filters: {},
    }), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('exports constants', () => {
    expect(POINT_LAYER_TYPES.length).toBeGreaterThan(0);
  });
});
