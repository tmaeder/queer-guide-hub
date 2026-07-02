import { useEffect, useRef, type MutableRefObject } from 'react';
import maplibregl from 'maplibre-gl';
import { summaryFromFeature, type MapPointSummary } from '@/components/map/mapPoint';
import type { PointFeature } from '@/hooks/useViewportPoints';

interface UseSelectionFlyerParams {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  mapReady: boolean;
  selectedId?: string | null;
  pointsGeoJSON: GeoJSON.FeatureCollection;
  showPopup: (
    map: maplibregl.Map,
    lngLat: maplibregl.LngLat | [number, number],
    point: MapPointSummary,
  ) => void;
}

/**
 * On selection (e.g. a rail-card click), fly to the pin and open its popup —
 * de-duped via a last-selected ref. Extracted verbatim from ExploreMap —
 * behavior-preserving. `lastSelectedRef` is touched only here so it's hook-owned.
 */
export function useSelectionFlyer({
  mapRef,
  mapReady,
  selectedId,
  pointsGeoJSON,
  showPopup,
}: UseSelectionFlyerParams) {
  const lastSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!selectedId) {
      lastSelectedRef.current = null;
      return;
    }
    if (selectedId === lastSelectedRef.current) return;
    const f = pointsGeoJSON.features.find((ft) => ft.properties.id === selectedId);
    if (!f) return;
    lastSelectedRef.current = selectedId;
    const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
    map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 14), speed: 1.4 });
    showPopup(map, coords, summaryFromFeature(f as unknown as PointFeature));
  }, [selectedId, pointsGeoJSON, mapReady, showPopup, mapRef]);
}
