import { useCallback, type MutableRefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import { summaryFromFeature } from '@/components/map/mapPoint';
import { ink } from '@/lib/mapTokens';
import type { PointFeature } from '@/hooks/useViewportPoints';

interface UseSpiderfyParams {
  spiderMarkersRef: MutableRefObject<maplibregl.Marker[]>;
  showPopup: (
    map: maplibregl.Map,
    lngLat: maplibregl.LngLat | [number, number],
    point: ReturnType<typeof summaryFromFeature>,
  ) => void;
  onSelectPointRef: MutableRefObject<((id: string) => void) | undefined>;
}

/**
 * Fan a co-located cluster's leaves out in a ring of clickable DOM markers, and
 * a clearer for them. Extracted verbatim from ExploreMap — behavior-preserving.
 * `spiderMarkersRef` stays component-owned (init movestart + teardown clear it).
 */
export function useSpiderfy({ spiderMarkersRef, showPopup, onSelectPointRef }: UseSpiderfyParams) {
  // Remove any fanned-out spider markers.
  const clearSpider = useCallback(() => {
    if (spiderMarkersRef.current.length) {
      spiderMarkersRef.current.forEach((m) => m.remove());
      spiderMarkersRef.current = [];
    }
  }, [spiderMarkersRef]);

  // Fan a co-located cluster's leaves out in a ring of DOM markers so each is
  // individually clickable (zooming can't separate identical coordinates).
  //
  // Two guards against the "giant ring" seen on /people and /map:
  //
  // 1. Callers reach this AFTER awaiting getClusterExpansionZoom /
  //    getClusterLeaves. A double-click on a cluster fires its click AND a
  //    dblclick zoom, and the zoom's `movestart` (which clears the ring) can
  //    run before those awaits resolve. The ring was then added mid-zoom and
  //    nothing ever removed it. Refuse to fan out while the map is moving.
  // 2. Every marker sits AT the cluster's own position with a pixel `offset`,
  //    instead of at a lngLat unprojected from a pixel offset. The old way
  //    fixed each marker's geography at the zoom it was created at, so any
  //    zoom after that scaled the ring with the map: a 140px ring became a
  //    city-sized one. Offset anchoring keeps it a fixed-size ring around the
  //    real location at every zoom.
  const spiderfy = useCallback(
    (map: maplibregl.Map, center: [number, number], leaves: PointFeature[]) => {
      if (!leaves.length || map.isMoving()) return;
      const n = leaves.length;
      const radius = Math.min(140, 36 + n * 9);
      leaves.forEach((leaf, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
        const offset: [number, number] = [radius * Math.cos(angle), radius * Math.sin(angle)];
        const summary = summaryFromFeature(leaf);
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('aria-label', summary.name);
        el.title = summary.name;
        // Small stations: track fill inside the same ink border every other
        // pin carries (the fills are border-gated, see usePointLayers).
        el.style.cssText = `width:25px;height:25px;border-radius:9999px;background:${summary.color};border:1.5px solid ${ink()};box-sizing:border-box;cursor:pointer;padding:0;`;
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          showPopup(map, center, summary);
          onSelectPointRef.current?.(summary.id);
        });
        const marker = new maplibregl.Marker({ element: el, offset }).setLngLat(center).addTo(map);
        spiderMarkersRef.current.push(marker);
      });
    },
    [showPopup, spiderMarkersRef, onSelectPointRef],
  );

  return { spiderfy, clearSpider };
}
