import { useCallback, useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import { type Root } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import { mapStyle } from '@/config/mapStyle';
import { loadGlyphImages } from '@/components/map/mapGlyphs';
import type { MapViewport } from '@/hooks/useExploreMapData';
import { clampBbox, type Bbox } from '@/utils/mapViewport';
import type { ExploreMapHandle } from '@/components/map/ExploreMap';

interface UseMapInstanceParams {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  mapRef: MutableRefObject<maplibregl.Map | null>;
  initialCenter?: [number, number];
  initialZoom?: number;
  viewport: MapViewport;
  mapReady: boolean;
  cooperativeGestures: boolean;
  linkToFullMap?: string;
  onViewportChange: (bbox: Bbox, zoom: number) => void;
  onViewportChangeProp?: (viewport: { center: [number, number]; zoom: number }) => void;
  setMapReady: Dispatch<SetStateAction<boolean>>;
  setIsCounterStale: Dispatch<SetStateAction<boolean>>;
  setCurrentZoom: Dispatch<SetStateAction<number>>;
  recomputeRef: MutableRefObject<() => void>;
  spiderMarkersRef: MutableRefObject<maplibregl.Marker[]>;
  pulseRafRef: MutableRefObject<number | null>;
  popupRootRef: MutableRefObject<Root | null>;
  pointLayersAddedRef: MutableRefObject<boolean>;
  /** Render MapLibre's native zoom buttons. MapShell passes false and drives
   *  the map through the handle below via its own MapNavControls. */
  showNativeNav: boolean;
  /** Latest-value ref for the onMapHandle callback — receives the imperative
   *  handle on load and null on teardown. */
  onMapHandleRef: MutableRefObject<((handle: ExploreMapHandle | null) => void) | undefined>;
}

/**
 * Map lifecycle: constructs the MapLibre instance + controls, wires the
 * load/movestart/moveend handlers, flies to the initial viewport, and tears the
 * whole thing down (cancelling rAF, unmounting the popup root, clearing spider
 * markers, resetting coordination refs). Extracted verbatim from ExploreMap —
 * behavior-preserving. The init effect keeps its run-once `[]` deps; the shared
 * coordination refs stay component-owned and are threaded in.
 */
export function useMapInstance({
  containerRef,
  mapRef,
  initialCenter,
  initialZoom,
  viewport,
  mapReady,
  cooperativeGestures,
  linkToFullMap,
  onViewportChange,
  onViewportChangeProp,
  setMapReady,
  setIsCounterStale,
  setCurrentZoom,
  recomputeRef,
  spiderMarkersRef,
  pulseRafRef,
  popupRootRef,
  pointLayersAddedRef,
  showNativeNav,
  onMapHandleRef,
}: UseMapInstanceParams) {
  // ── Helper: extract bbox from map ────────────────────────────────────────
  const getMapBbox = useCallback((map: maplibregl.Map): Bbox => {
    const bounds = map.getBounds();
    return clampBbox({
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    });
  }, []);

  // ── Map initialisation ───────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Graceful WebGL check — avoid hard crash when GPU is unavailable
    const testCanvas = document.createElement('canvas');
    const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
    if (!gl) {
      console.warn('WebGL not available — map disabled');
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: initialCenter ?? viewport.center,
      zoom: initialZoom ?? viewport.zoom,
      attributionControl: false,
      // Embedded above page content → let the page scroll; zoom needs a modifier.
      cooperativeGestures,
    });
    // Assign immediately so the early-return at the top of this effect
    // bails on the next render rather than re-initialising the map.
    // `mapReady` (toggled in `load`) still gates marker / layer
    // rendering.
    mapRef.current = map;

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    if (showNativeNav) {
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    }
    // Always mounted — the GeolocateControl owns the blue tracking dot. When
    // the native buttons are replaced (showNativeNav=false), ExploreMap's
    // container class hides the top-right ctrl corner and MapNavControls
    // drives this control through the handle's triggerGeolocate().
    const geolocateControl = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserLocation: true,
    });
    map.addControl(geolocateControl, 'top-right');

    onMapHandleRef.current?.({
      map,
      geolocateControl,
      triggerGeolocate: () => geolocateControl.trigger(),
    });

    if (linkToFullMap) map.scrollZoom.disable();

    map.on('load', () => {
      setMapReady(true);
      // Rasterize category glyphs into map images (safe no-op on failure).
      void loadGlyphImages(map);

      const tryInitialFetch = () => {
        const canvas = map.getCanvas();
        if (!canvas.clientWidth || !canvas.clientHeight) return false;
        const bbox = getMapBbox(map);
        onViewportChange(bbox, map.getZoom());
        return true;
      };

      if (!tryInitialFetch()) {
        // Canvas may not be laid out yet — retry after paint
        requestAnimationFrame(() => tryInitialFetch());
      }
    });

    map.on('movestart', () => {
      setIsCounterStale(true);
      // Fanned-out spider markers are pixel-anchored; drop them on any move.
      if (spiderMarkersRef.current.length) {
        spiderMarkersRef.current.forEach((m) => m.remove());
        spiderMarkersRef.current = [];
      }
    });

    map.on('moveend', () => {
      const canvas = map.getCanvas();
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      const bbox = getMapBbox(map);
      const z = map.getZoom();
      onViewportChange(bbox, z);
      setCurrentZoom(z);
      const c = map.getCenter();
      onViewportChangeProp?.({ center: [c.lng, c.lat], zoom: z });
      recomputeRef.current();
    });

    return () => {
      onMapHandleRef.current?.(null);
      if (pulseRafRef.current) {
        cancelAnimationFrame(pulseRafRef.current);
        pulseRafRef.current = null;
      }
      const r = popupRootRef.current;
      popupRootRef.current = null;
      if (r) setTimeout(() => r.unmount(), 0);
      spiderMarkersRef.current.forEach((m) => m.remove());
      spiderMarkersRef.current = [];
      mapRef.current = null;
      pointLayersAddedRef.current = false;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to initial viewport once map is ready (e.g. from IP geo)
  useEffect(() => {
    if (!mapRef.current || !mapReady || initialCenter) return;
    mapRef.current.flyTo({ center: viewport.center, zoom: viewport.zoom, speed: 1.2 });
  }, [viewport, mapReady, initialCenter, mapRef]);
}
