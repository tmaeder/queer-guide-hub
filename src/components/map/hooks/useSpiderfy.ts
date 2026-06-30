import { useCallback, type MutableRefObject } from 'react';
import maplibregl from 'maplibre-gl';
import { summaryFromFeature } from '@/components/map/mapPoint';
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
  const spiderfy = useCallback(
    (map: maplibregl.Map, center: [number, number], leaves: PointFeature[]) => {
      if (!leaves.length) return;
      const origin = map.project(center);
      const n = leaves.length;
      const radius = Math.min(140, 36 + n * 9);
      leaves.forEach((leaf, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
        const lngLat = map.unproject([
          origin.x + radius * Math.cos(angle),
          origin.y + radius * Math.sin(angle),
        ]);
        const summary = summaryFromFeature(leaf);
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('aria-label', summary.name);
        el.title = summary.name;
        el.style.cssText = `width:22px;height:22px;border-radius:9999px;background:${summary.color};border:2.5px solid #fff;box-sizing:border-box;cursor:pointer;padding:0;`;
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          showPopup(map, lngLat, summary);
          onSelectPointRef.current?.(summary.id);
        });
        const marker = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
        spiderMarkersRef.current.push(marker);
      });
    },
    [showPopup, spiderMarkersRef, onSelectPointRef],
  );

  return { spiderfy, clearSpider };
}
