import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { type Root } from 'react-dom/client';
import * as maplibregl from 'maplibre-gl';
import { getMapStyle } from '@/config/mapStyle';
import { isWebglSupported } from '@/lib/webglSupport';
import { loadGlyphImages } from '@/components/map/mapGlyphs';
import { installBasemapFallback } from '@/components/map/basemapFallback';
import { DONUT_PREFIX, DONUT_PIXEL_RATIO, getDonutImage } from '@/components/map/clusterDonut';
import type { ExploreMapHandle } from '@/components/map/ExploreMap';
import type { MapViewport } from '@/hooks/useExploreMapData';
import { clampBbox, type Bbox } from '@/utils/mapViewport';

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
  /**
   * True when useMapAutoFly is guaranteed to fly somewhere shortly (no URL
   * center and auto-fly not skipped) — either to the visitor's IP location or
   * to the Berlin fallback at 2.5 s. The `load` handler then skips its own
   * world-bbox fetch, because the fly's `moveend` refetches ~0.3 s later and
   * crosses a zoom bucket (2.2 → 10), so the padded-bbox skip cannot suppress
   * it. Without this the dataset is fetched, parsed and clustered twice on
   * every cold load, and the pins shown first are for a viewport nobody sees.
   */
  deferInitialFetch?: boolean;
  setMapReady: Dispatch<SetStateAction<boolean>>;
  setIsCounterStale: Dispatch<SetStateAction<boolean>>;
  setCurrentZoom: Dispatch<SetStateAction<number>>;
  recomputeRef: MutableRefObject<() => void>;
  spiderMarkersRef: MutableRefObject<maplibregl.Marker[]>;
  pulseRafRef: MutableRefObject<number | null>;
  popupRootRef: MutableRefObject<Root | null>;
  pointLayersAddedRef: MutableRefObject<boolean>;
}

/**
 * Map lifecycle: constructs the MapLibre instance + controls, wires the
 * load/movestart/moveend handlers, flies to the initial viewport, and tears the
 * whole thing down (cancelling rAF, unmounting the popup root, clearing spider
 * markers, resetting coordination refs). The shared coordination refs stay
 * component-owned and are threaded in.
 *
 * The init effect runs exactly once per mount. It used to re-run on
 * `basemapMode` (theme toggle → rebuild with the matching Protomaps flavor,
 * camera preserved); dark mode was removed with the subway rebrand, so that
 * branch is gone along with the camera-restore machinery it existed for.
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
  deferInitialFetch = false,
  setMapReady,
  setIsCounterStale,
  setCurrentZoom,
  recomputeRef,
  spiderMarkersRef,
  pulseRafRef,
  popupRootRef,
  pointLayersAddedRef,
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

  // Initial-fetch deferral bookkeeping. Refs, not deps: the map is built once
  // and re-running that effect would tear down and recreate the whole instance.
  const deferInitialFetchRef = useRef(deferInitialFetch);
  // Synced in an effect, not during render (react-hooks/refs). Safe for the
  // reader below: it is only read inside the map's async `load` handler, which
  // fires long after mount effects have flushed.
  useEffect(() => {
    deferInitialFetchRef.current = deferInitialFetch;
  }, [deferInitialFetch]);
  const didViewportFetchRef = useRef(false);
  const initialFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Detach fn for the basemap failover listener, cleared on teardown so it
  // cannot leak onto a dead map.
  const detachBasemapFallbackRef = useRef<(() => void) | null>(null);

  // ── Map initialisation ───────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Graceful WebGL check — avoid hard crash when GPU is unavailable
    if (!isWebglSupported()) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center: initialCenter ?? viewport.center,
      zoom: initialZoom ?? viewport.zoom,
      attributionControl: false,
      // Embedded above page content → let the page scroll; zoom needs a modifier.
      cooperativeGestures,
    });
    // mapRef is published inside `load` (below), NOT here. Layer effects gate
    // on `!mapRef.current`, and publishing early would let them call
    // addSource/addLayer against a style that is still loading, which throws.

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    if (showNativeNav) {
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    }
    // Always mounted — the GeolocateControl owns the blue tracking dot. When
    // the native buttons are replaced (showNativeNav=false), the container's
    // qg-hide-native-nav class hides the top-right ctrl corner and
    // MapNavControls drives this control through the handle's triggerGeolocate().
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

    // Emergency basemap failover. No-op unless VITE_BASEMAP_FALLBACK_TILE_URL
    // is set; installed here (not in `load`) so tile errors during the very
    // first style fetch are counted too.
    detachBasemapFallbackRef.current = installBasemapFallback(map);

    // Donut cluster icons are generated on demand: the cluster layer's
    // icon-image expression produces composition-encoded ids; any id the
    // style doesn't know yet is rasterized synchronously right here.
    //
    // This MUST be the resolver, not a `styleimagemissing` listener. On
    // maplibre-gl 6 (installed since the 6.2.0 bump) the event is notify-only
    // and fires AFTER the resolver has already declined — an addImage from the
    // listener lands too late for the frame that needed it, so clusters paint
    // their count with no disc behind it until some later repaint happens to
    // pick the image up. That is the intermittent bare-number cluster seen in
    // production. The resolver is awaited by MapLibre before the image counts
    // as missing, so the disc is there on first paint.
    map.setMissingStyleImageResolver((id: string) => {
      if (!id.startsWith(`${DONUT_PREFIX}|`) || map.hasImage(id)) return;
      const img = getDonutImage(id);
      if (img && !map.hasImage(id)) {
        try {
          map.addImage(id, img, { pixelRatio: DONUT_PIXEL_RATIO });
        } catch {
          /* concurrent add — ignore */
        }
      }
    });

    if (linkToFullMap) map.scrollZoom.disable();

    map.on('load', () => {
      mapRef.current = map;
      setMapReady(true);
      // Rasterize category glyphs into map images (safe no-op on failure).
      void loadGlyphImages(map);

      const tryInitialFetch = () => {
        const canvas = map.getCanvas();
        if (!canvas.clientWidth || !canvas.clientHeight) return false;
        const bbox = getMapBbox(map);
        didViewportFetchRef.current = true;
        onViewportChange(bbox, map.getZoom());
        return true;
      };

      if (deferInitialFetchRef.current) {
        // An auto-fly is coming; its moveend does the first real fetch. Arm a
        // safety net just past the 2.5 s Berlin fallback: if no viewport fetch
        // has happened by then (fly never fired, or flyTo was a no-op), fetch
        // the current viewport so the map can never sit permanently empty.
        // A stranded empty map is far worse than one duplicate fetch.
        initialFetchTimerRef.current = setTimeout(() => {
          if (didViewportFetchRef.current) return;
          // A fly can still be in the air here (slow geo lookup → 2.5 s Berlin
          // fallback, then the animation). Firing now would cause the exact
          // double fetch this deferral removes, so leave it to its moveend.
          if (map.isMoving()) return;
          tryInitialFetch();
        }, 3000);
        return;
      }
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
      // The auto-fly's moveend is the deferred first fetch — disarm the net.
      didViewportFetchRef.current = true;
      if (initialFetchTimerRef.current) {
        clearTimeout(initialFetchTimerRef.current);
        initialFetchTimerRef.current = null;
      }
      onViewportChange(bbox, z);
      setCurrentZoom(z);
      const c = map.getCenter();
      onViewportChangeProp?.({ center: [c.lng, c.lat], zoom: z });
      recomputeRef.current();
    });

    return () => {
      // Latest-value ref by design: notify whatever callback the consumer
      // holds NOW (not a mount-time snapshot) that the handle is gone.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      onMapHandleRef.current?.(null);
      if (pulseRafRef.current) {
        cancelAnimationFrame(pulseRafRef.current);
        pulseRafRef.current = null;
      }
      if (initialFetchTimerRef.current) {
        clearTimeout(initialFetchTimerRef.current);
        initialFetchTimerRef.current = null;
      }
      detachBasemapFallbackRef.current?.();
      detachBasemapFallbackRef.current = null;
      const r = popupRootRef.current;
      popupRootRef.current = null;
      if (r) setTimeout(() => r.unmount(), 0);
      spiderMarkersRef.current.forEach((m) => m.remove());
      spiderMarkersRef.current = [];
      mapRef.current = null;
      pointLayersAddedRef.current = false;
      // Gate layer/marker effects until the replacement map fires `load` —
      // they all key on `mapReady`, which re-flips true and re-adds everything.
      setMapReady(false);
      map.remove();
    };
    // Mount-once: every value read above is either a ref or a first-render
    // prop, and re-running would tear down and rebuild the whole instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- construct once per mount
  }, []);

  // Fly to initial viewport once map is ready (e.g. from IP geo)
  useEffect(() => {
    if (!mapRef.current || !mapReady || initialCenter) return;
    mapRef.current.flyTo({ center: viewport.center, zoom: viewport.zoom, speed: 1.2 });
  }, [viewport, mapReady, initialCenter, mapRef]);
}
