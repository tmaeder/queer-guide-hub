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

import { useExploreMapData, LAYER_COLORS } from '../useExploreMapData';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useExploreMapData', () => {
  it('returns shape', () => {
    const { result } = renderHook(() => useExploreMapData({ enabledLayers: [], viewport: { center: [0, 0], zoom: 2 }, filters: {} }), { wrapper });
    expect(result.current).toBeDefined();
  });
  it('exports LAYER_COLORS', () => {
    expect(LAYER_COLORS).toBeDefined();
  });
});
