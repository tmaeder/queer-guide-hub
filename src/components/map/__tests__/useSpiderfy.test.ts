import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Marker } from 'maplibre-gl';

/**
 * The "giant ring" bug: a double-click on a cluster fanned its leaves out
 * mid-zoom, and each leaf sat at a lngLat unprojected from a pixel offset at
 * the OLD zoom, so the ring scaled with the map and was never cleared.
 */

const created: Array<{ opts: { offset?: [number, number] }; lngLat?: unknown }> = [];

vi.mock('maplibre-gl', () => ({
  Marker: class {
    opts: { offset?: [number, number] };
    lngLat?: unknown;
    constructor(opts: { offset?: [number, number] }) {
      this.opts = opts;
      created.push(this);
    }
    setLngLat(ll: unknown) {
      this.lngLat = ll;
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  },
}));

vi.mock('@/components/map/mapPoint', () => ({
  summaryFromFeature: (f: { properties: { id: string } }) => ({
    id: f.properties.id,
    name: f.properties.id,
    color: 'hsl(0 0% 0%)',
  }),
}));

vi.mock('@/lib/mapTokens', () => ({ ink: () => 'hsl(0 0% 7%)' }));

import { useSpiderfy } from '@/components/map/hooks/useSpiderfy';

const leaves = Array.from({ length: 6 }, (_, i) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [8.54, 47.37] },
  properties: { id: `p${i}` },
}));

function setup() {
  const ref = { current: [] as Marker[] };
  const { result } = renderHook(() =>
    useSpiderfy({
      spiderMarkersRef: ref,
      showPopup: vi.fn(),
      onSelectPointRef: { current: undefined },
    }),
  );
  return { result, ref };
}

const fakeMap = (moving: boolean) =>
  ({
    isMoving: () => moving,
    // Must not be needed any more: markers are anchored by offset.
    project: () => {
      throw new Error('spiderfy must not project — it anchors by pixel offset');
    },
    unproject: () => {
      throw new Error('spiderfy must not unproject — it anchors by pixel offset');
    },
  }) as never;

describe('useSpiderfy', () => {
  beforeEach(() => {
    created.length = 0;
  });

  it('positive control: fans leaves out when the map is still', () => {
    const { result, ref } = setup();
    result.current.spiderfy(fakeMap(false), [8.54, 47.37], leaves as never);
    expect(created).toHaveLength(6);
    expect(ref.current).toHaveLength(6);
  });

  it('refuses to fan out while the map is moving (dblclick zoom race)', () => {
    const { result, ref } = setup();
    result.current.spiderfy(fakeMap(true), [8.54, 47.37], leaves as never);
    expect(created).toHaveLength(0);
    expect(ref.current).toHaveLength(0);
  });

  it('anchors every marker at the cluster position with a fixed pixel offset', () => {
    const { result } = setup();
    result.current.spiderfy(fakeMap(false), [8.54, 47.37], leaves as never);
    for (const m of created) {
      expect(m.lngLat).toEqual([8.54, 47.37]);
      const [x, y] = m.opts.offset!;
      // On a circle of the documented radius (36 + 6*9 = 90px).
      expect(Math.round(Math.hypot(x, y))).toBe(90);
    }
  });
});
