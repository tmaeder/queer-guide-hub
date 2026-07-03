import { useCallback, useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import { type Root } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import { mapStyle } from '@/config/mapStyle';
import { loadGlyphImages } from '@/components/map/mapGlyphs';
import {
  DONUT_PREFIX,
  DONUT_PIXEL_RATIO,
  getDonutImage,
} from '@/components/map/clusterDonut';
import type { ExploreMapHandle } from '@/components/map/ExploreMap';
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
  /** Add MapLibre's native NavigationControl. MapShell passes false and mounts
   *  its own MapNavControls; the GeolocateControl is always added (it owns the
   *  blue tracking dot) and hidden via CSS on those surfaces. */
  showNativeNav: boolean;
  /** Latest-value ref for the onMapHandle prop — fired with the imperative
   *  handle after construction, null on teardown. */
  onMapHandleRef: MutableRefObject<((handle: ExploreMapHandle | null) => void) | undefined>;
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
  showNativeNav,
  onMapHandleRef,
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
    // the native buttons are replaced (showNativeNav=false), the container's
    // qg-hide-native-nav class hides the top-right ctrl corner and
    // MapNavControls drives this control through the handle's triggerGeolocate().
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

    // Donut cluster icons are generated on demand: the cluster layer's
    // icon-image expression produces composition-encoded ids; any id the
    // style doesn't know yet is rasterized synchronously right here.
    map.on('styleimagemissing', (e: { id: string }) => {
      if (!e.id.startsWith(`${DONUT_PREFIX}|`) || map.hasImage(e.id)) return;
      const img = getDonutImage(e.id);
      if (img && !map.hasImage(e.id)) {
        try {
          map.addImage(e.id, img, { pixelRatio: DONUT_PIXEL_RATIO });
        } catch {
          /* concurrent add — ignore */
        }
      }
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
      // eslint-disable-next-line react-hooks/exhaustive-deps -- latest-value ref by design: teardown must notify the CURRENT handle consumer, not the mount-time one.
      // Latest-value ref by design: notify whatever callback the consumer
      // holds NOW (not a mount-time snapshot) that the handle is gone.
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
