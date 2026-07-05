import { useEffect, type MutableRefObject } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import { FOCUS_RING_LAYER, FOCUS_SOURCE } from '@/config/mapLayers';

interface UseFocusRingParams {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  mapReady: boolean;
  selectedId?: string | null;
  highlightedId?: string | null;
  pointsGeoJSON: GeoJSON.FeatureCollection;
}

/**
 * Focus ring around the rail-hovered (or selected) pin. Extracted verbatim from
 * ExploreMap — behavior-preserving.
 */
export function useFocusRing({
  mapRef,
  mapReady,
  selectedId,
  highlightedId,
  pointsGeoJSON,
}: UseFocusRingParams) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    // Hover wins over selection so the ring tracks the card you're pointing at;
    // it falls back to the last selected pin when nothing is hovered.
    const focusId = highlightedId ?? selectedId ?? null;

    let coords: [number, number] | null = null;
    if (focusId) {
      const f = pointsGeoJSON.features.find((ft) => ft.properties.id === focusId);
      if (f) coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    }

    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: coords
        ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties: {} }]
        : [],
    };

    const src = map.getSource(FOCUS_SOURCE) as GeoJSONSource | undefined;
    if (src) {
      src.setData(fc);
    } else {
      map.addSource(FOCUS_SOURCE, { type: 'geojson', data: fc });
      map.addLayer({
        id: FOCUS_RING_LAYER,
        type: 'circle',
        source: FOCUS_SOURCE,
        paint: {
          'circle-radius': 18,
          'circle-color': 'rgba(10,10,10,0.06)',
          'circle-stroke-width': 3.5,
          'circle-stroke-color': '#0a0a0a',
          'circle-stroke-opacity': 1,
          'circle-radius-transition': { duration: 180, delay: 0 },
        },
      });
    }
  }, [selectedId, highlightedId, pointsGeoJSON, mapReady, mapRef]);
}
