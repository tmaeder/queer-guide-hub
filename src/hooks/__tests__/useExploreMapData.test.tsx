/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => {
  const builder: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(onFulfilled);
        }
        if (prop === 'maybeSingle') {
          return () => Promise.resolve({ data: null, error: null });
        }
        return () => builder;
      },
    },
  );
  return {
    supabase: {
      from: () => builder,
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    },
  };
});

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
