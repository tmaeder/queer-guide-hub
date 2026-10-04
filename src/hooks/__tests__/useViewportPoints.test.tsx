/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const venue = (id: string, category: string) => ({
  id,
  slug: `venue-${id}`,
  name: `Venue ${id}`,
  category,
  latitude: 52.5,
  longitude: 13.4,
  city: 'Berlin',
  country: 'DE',
  is_featured: false,
});

/**
 * One row per line the `venues` layer can land on — the whole reason the C and
 * T lines exist is that a single fetch layer splits across three.
 *
 * A module-level const, deliberately: a `vi.mock` factory runs in its own
 * context and does not observe mutations to the test module's bindings, so
 * flipping a `let` between tests silently served the first fixture to all of
 * them.
 */
const VENUE_ROWS = [
  venue('v1', 'bar'),
  venue('v2', 'community_center'),
  venue('v3', 'toilet'),
  venue('v4', 'hotel'),
];

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
      queryStub(table === 'venues' ? { data: VENUE_ROWS, error: null } : { data: [], error: null }),
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
    const { result } = renderHook(() => useViewportPoints({ enabledLayers: [], filters: {} }), {
      wrapper,
    });
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

    const venue = result.current.geojson.features.find((f) => f.properties.pointType === 'venues');
    expect(venue?.properties.name).toBe('Venue v1');
    expect(result.current.layerCounts.restrooms).toBe(0);
  }, 10000);

  /**
   * The producer tags `line` ON the feature because the consumers that need it
   * are MapLibre EXPRESSIONS — the render filter and the cluster aggregates —
   * and an expression cannot call into JS.
   */
  describe('line tagging', () => {
    it('splits one fetch layer across three lines by category', async () => {
      const { result } = renderHook(
        () => useViewportPoints({ enabledLayers: ['venues'], filters: {} }),
        { wrapper },
      );
      result.current.onViewportChange(BBOX, 12);
      await waitFor(() => expect(result.current.geojson.features.length).toBe(4), {
        timeout: 6000,
      });

      const lineOf = (id: string) =>
        result.current.geojson.features.find((f) => f.properties.id === `venue-${id}`)?.properties
          .line;

      expect(lineOf('v1'), 'bar belongs on the venues line').toBe('M');
      expect(lineOf('v2'), 'community_center belongs on the care line').toBe('C');
      expect(lineOf('v3'), 'toilet belongs on the care line').toBe('C');
      expect(lineOf('v4'), 'a hotel-category venue belongs on the stay line').toBe('T');

      // THE POSITIVE CONTROL. All four rows arrive from ONE fetch layer, so a
      // producer that tagged by `pointType` instead of by category would answer
      // 'M' four times — which passes nothing above but would pass a weaker
      // "every feature has a line" check on its own.
      const lines = new Set(result.current.geojson.features.map((f) => f.properties.line));
      expect(lines.size, 'the venues layer collapsed onto a single line').toBe(3);
    }, 10000);

    it('tags entity and line on every feature', async () => {
      const { result } = renderHook(
        () => useViewportPoints({ enabledLayers: ['venues'], filters: {} }),
        { wrapper },
      );
      result.current.onViewportChange(BBOX, 12);
      await waitFor(() => expect(result.current.geojson.features.length).toBeGreaterThan(0), {
        timeout: 6000,
      });

      for (const f of result.current.geojson.features) {
        // `null` is reserved for an area entity drawn as a pin; this producer
        // fetches point layers only, so an untagged feature is a defect.
        expect(f.properties.line, `${f.properties.id} has no line`).not.toBeNull();
        expect(f.properties.entity, `${f.properties.id} has no entity`).toBe('venue');
      }
    }, 10000);
  });
});
