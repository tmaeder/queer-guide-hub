/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const venueRow = {
  id: 'v1',
  slug: 'venue-one',
  name: 'Venue One',
  category: 'bar',
  latitude: 52.5,
  longitude: 13.4,
  city: 'Berlin',
  country: 'DE',
  is_featured: false,
};

// Chainable query-builder stub: every PostgREST method returns the proxy, and
// awaiting it resolves to { data, error }. Lets us drive the real fetch path.
function queryStub(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result);
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return p.then.bind(p);
        if (prop === 'catch') return p.catch.bind(p);
        if (prop === 'finally') return p.finally.bind(p);
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) =>
      queryStub(table === 'venues' ? { data: [venueRow], error: null } : { data: [], error: null }),
    // Restrooms layer — simulate the get-refuge-restrooms edge function 500ing.
    functions: { invoke: vi.fn().mockRejectedValue(new Error('Edge Function returned 500')) },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

import { useViewportPoints, POINT_LAYER_TYPES } from '../useViewportPoints';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const BBOX = { north: 52.6, south: 52.4, east: 13.5, west: 13.3 };

describe('useViewportPoints', () => {
  it('returns shape', () => {
    const { result } = renderHook(
      () => useViewportPoints({ enabledLayers: [], filters: {} }),
      { wrapper },
    );
    expect(result.current).toBeDefined();
    expect(typeof result.current.onViewportChange).toBe('function');
  });

  it('exports constants', () => {
    expect(POINT_LAYER_TYPES.length).toBeGreaterThan(0);
  });

  // Regression: a failing layer (restrooms edge function 500) must not blank
  // the whole map. Before the per-layer try/catch, one rejection failed the
  // Promise.all and discarded venues too, leaving "0 results in view".
  it('renders healthy layers even when another layer fails', async () => {
    const { result } = renderHook(
      () => useViewportPoints({ enabledLayers: ['venues', 'restrooms'], filters: {} }),
      { wrapper },
    );

    result.current.onViewportChange(BBOX, 12);

    await waitFor(
      () => {
        expect(result.current.geojson.features.length).toBeGreaterThan(0);
      },
      { timeout: 6000 },
    );

    const venue = result.current.geojson.features.find(
      (f) => f.properties.pointType === 'venues',
    );
    expect(venue?.properties.name).toBe('Venue One');
    expect(result.current.layerCounts.restrooms).toBe(0);
  }, 10000);
});
