/* eslint-disable react-hooks/refs -- map components pass MapLibre ref.current (the imperative map handle) into custom hooks during render; this is the documented MapLibre integration pattern. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Root } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { summaryFromFeature, type MapPointSummary } from './mapPoint';
import { loadGlyphImages } from './mapGlyphs';
import { DONUT_PREFIX, DONUT_PIXEL_RATIO, donutIconExpression, getDonutImage } from './clusterDonut';
import { clusterHoverHtml, pointHoverHtml } from './mapHoverHtml';
import type { PointFeature } from '@/hooks/useViewportPoints';
import { mapStyle } from '@/config/mapStyle';
import {
  useExploreMapData,
  type LayerType,
  type MapViewport,
  type ExploreMapFilters,
  LAYER_COLORS,
} from '@/hooks/useExploreMapData';
import { useViewportPoints, POINT_LAYER_TYPES } from '@/hooks/useViewportPoints';
import { ExploreMapLayers, LAYER_DEFS } from '@/components/map/ExploreMapLayers';
import { ExploreMapFiltersPanel } from '@/components/map/ExploreMapFilters';
import { MapResultsPill } from '@/components/map/MapResultsPill';
import { LocationHint } from '@/components/map/LocationHint';
import { MapEmptyState } from '@/components/map/MapEmptyState';
import { useLocationHint } from '@/components/map/hooks/useLocationHint';
import { useMapAutoFly } from '@/components/map/hooks/useMapAutoFly';
import { usePopupManager } from '@/components/map/hooks/usePopupManager';
import { useSpiderfy } from '@/components/map/hooks/useSpiderfy';
import { usePulseAnimation } from '@/components/map/hooks/usePulseAnimation';
import { useInBoundsCount } from '@/components/map/hooks/useInBoundsCount';
import { useAreaLayers } from '@/components/map/hooks/useAreaLayers';
import { useHeatmapLayer } from '@/components/map/hooks/useHeatmapLayer';
import { useFocusRing } from '@/components/map/hooks/useFocusRing';
import { useSelectionFlyer } from '@/components/map/hooks/useSelectionFlyer';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { useToast } from '@/hooks/use-toast';
import { CLUSTER_MAX_ZOOM, CLUSTER_RADIUS, clampBbox, type Bbox } from '@/utils/mapViewport';
import {
  useCountryBoundaries,
  useCityBoundaries,
  useNeighbourhoodBoundaries,
} from '@/hooks/useBoundaryData';
import { useMapBoundaryLayers } from '@/hooks/useMapBoundaryLayers';
import { type RenderMode } from './mapShellAdapters';
import {
  AREA_LAYERS,
  POINTS_SOURCE,
  CLUSTERS_LAYER,
  CLUSTER_COUNT_LAYER,
  UNCLUSTERED_LAYER,
  GLYPH_LAYER,
  FEATURED_RING_LAYER,
  PULSE_LAYER,
  PIN_LAYER_IDS,
  COUNTRY_BOUNDARY_CONFIG,
  CITY_BOUNDARY_CONFIG,
  NEIGHBOURHOOD_BOUNDARY_CONFIG,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
} from '@/config/mapLayers';

// Stable empty favorites set so effects don't churn when none are passed.
const EMPTY_FAV: ReadonlySet<string> = new Set<string>();

// Gated debug logger — env-flag or localStorage opt-in. Cheap insurance
// against future regressions in the points-data → markers flow.
const mapDebug = (...args: unknown[]): void => {
  try {
    if (
      import.meta.env.DEV ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('qg:debug:map') === '1')
    ) {
       
      console.debug('[venues-map]', ...args);
    }
  } catch {
    /* localStorage may throw in some sandboxed contexts */
  }
};

export interface ExploreMapProps {
  height?: number | string;
  defaultLayers?: LayerType[];
  defaultFilters?: Partial<ExploreMapFilters>;
  showLayerToggles?: boolean;
  showFilters?: boolean;
  linkToFullMap?: string;
  className?: string;
  /** Initial center override [lng, lat] */
  initialCenter?: [number, number];
  /** Initial zoom override */
  initialZoom?: number;
  /** Skip visitor geo auto-fly */
  skipAutoFly?: boolean;
  /** Fired on map idle / moveend with the new viewport. Use to encode
   *  state in the URL or persist preferences. */
  onViewportChange?: (viewport: { center: [number, number]; zoom: number }) => void;
  /** Fired when the enabled layer set changes. */
  onLayersChange?: (layers: LayerType[]) => void;
  /** Rendering style for point data. `'pins'` (default) shows clusters + markers.
   *  `'heatmap'` swaps clusters/markers for the density layer. `'combined'`
   *  draws the heatmap beneath the pins (both visible). */
  renderMode?: RenderMode;
  /** MapShell-only mode flag — enables the queer-voiced empty state and other
   *  MapShell-specific UX. (The former pride-spectrum palette was removed in
   *  the monochrome strip; all maps now use the functional LAYER_COLORS and a
   *  monochrome density ramp.) */
  mapShellMode?: boolean;
  /** Fired (debounced, on data/viewport change) with the point summaries
   *  currently inside the visible bounds. Powers the spotlight rail. */
  onPointsInView?: (points: MapPointSummary[]) => void;
  /** Point id to fly to + open a popup for (e.g. a rail card click). */
  selectedId?: string | null;
  /** Point id to draw a focus ring around (e.g. a rail card hover). */
  highlightedId?: string | null;
  /** Show the bottom-right "N results in view" pill. MapShell turns this off
   *  because the spotlight rail already surfaces the count. */
  showResultCount?: boolean;
  /** Fired when a pin is clicked on the map, so the parent can sync selection
   *  (e.g. scroll the spotlight rail to the matching card). */
  onSelectPoint?: (id: string) => void;
  /** Fired when the point-fetch loading state flips (drives rail skeletons). */
  onFetchingChange?: (fetching: boolean) => void;
  /** Feature ids (`venue-<id>` / `event-<id>`) the viewer has saved. */
  favoriteIds?: Set<string>;
  /** When true, only saved points render (favorites layer). */
  savedOnly?: boolean;
  /** Cooperative gestures: wheel-scroll passes through to the page (zoom needs
   *  ⌘/ctrl+scroll, two fingers on touch). Use when the map is embedded above
   *  page content (e.g. the homepage hero) so it doesn't trap page scroll. */
  cooperativeGestures?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const ExploreMap = ({
  height = 480,
  defaultLayers,
  defaultFilters,
  showLayerToggles = true,
  showFilters = true,
  linkToFullMap,
  className,
  initialCenter,
  initialZoom,
  skipAutoFly = false,
  onViewportChange: onViewportChangeProp,
  onLayersChange: onLayersChangeProp,
  renderMode = 'pins',
  mapShellMode = false,
  onPointsInView,
  selectedId,
  highlightedId,
  showResultCount = true,
  onSelectPoint,
  onFetchingChange,
  favoriteIds,
  savedOnly = false,
  cooperativeGestures = false,
}: ExploreMapProps) => {
  const navigate = useLocalizedNavigate();
  const { toast } = useToast();
  const prefersReducedMotion = useReducedMotion();

  // Ambient "where am I" hint chip — auto-fades, never stacks with toasts.
  const { locationHint, showLocationHint } = useLocationHint();

  // ── Map refs ─────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const popupRootRef = useRef<Root | null>(null);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const pointLayersAddedRef = useRef(false);
  const pulseRafRef = useRef<number | null>(null);
  // DOM markers for the spiderfied (fanned-out) leaves of a co-located cluster.
  const spiderMarkersRef = useRef<maplibregl.Marker[]>([]);
  // Latest-value refs read inside imperative map callbacks / rAF loops.
  const onPointsInViewRef = useRef(onPointsInView);
  onPointsInViewRef.current = onPointsInView;
  const onSelectPointRef = useRef(onSelectPoint);
  onSelectPointRef.current = onSelectPoint;

  // ── State ────────────────────────────────────────────────────────────────
  const [mapReady, setMapReady] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(initialZoom ?? DEFAULT_ZOOM);

  const [enabledLayers, setEnabledLayers] = useState<LayerType[]>(
    () =>
      defaultLayers ?? LAYER_DEFS.filter((d) => d.defaultOn && !d.comingSoon).map((d) => d.type),
  );

  const [viewport, setViewport] = useState<MapViewport>({
    center: initialCenter ?? DEFAULT_CENTER,
    zoom: initialZoom ?? DEFAULT_ZOOM,
  });

  const [filters, setFilters] = useState<ExploreMapFilters>(defaultFilters ?? {});

  // When the parent owns filters (MapShell: showFilters=false passes a memoized
  // `defaultFilters`), keep our filter state in sync with it. Without this the
  // command bar's category / time / open-now / search controls never reach the
  // data layer — they only seeded the initial state. Legacy maps with the
  // built-in filter panel (showFilters=true) keep managing filters themselves.
  // Adjusting state during render (vs. an effect) on the memoized `defaultFilters`
  // reference change avoids a cascading re-render.
  const [syncedDefault, setSyncedDefault] = useState(defaultFilters);
  if (!showFilters && defaultFilters !== syncedDefault) {
    setSyncedDefault(defaultFilters);
    setFilters(defaultFilters ?? {});
  }

  // Time-of-day mode: after dark, open/live spots stay full strength while
  // everything else recedes — the map reflects "what's actually on right now."
  // Computed once at mount (a session rarely straddles the 19:00 boundary).
  const isNight = useMemo(() => {
    const h = new Date().getHours();
    return h < 7 || h >= 19;
  }, []);
  const pinOpacityExpr = useMemo(
    () =>
      (isNight
        ? ['case', ['==', ['get', 'live'], true], 1, 0.45]
        : 1) as maplibregl.ExpressionSpecification | number,
    [isNight],
  );

  // ── Data: area layers (global fetch — small, static datasets) ──────────
  const areaEnabledLayers = enabledLayers.filter((l) => AREA_LAYERS.includes(l));
  const {
    markers: areaMarkers,
    isFetching: areaFetching,
    layerCounts: areaLayerCounts,
  } = useExploreMapData({ enabledLayers: areaEnabledLayers, viewport, filters });

  // ── Data: point layers (viewport-based fetch with clustering) ──────────
  const pointEnabledLayers = enabledLayers.filter((l) => POINT_LAYER_TYPES.includes(l));
  const {
    geojson: pointsGeoJSON,
    // totalCount from the hook is the padded-bbox count; we compute an
    // in-bounds count locally instead. Keep destructure stable for the
    // hook's interface — discard via underscore.
    totalCount: _padCount,
    isFetching: pointsFetching,
    layerCounts: pointLayerCounts,
    onViewportChange,
  } = useViewportPoints({
    enabledLayers: pointEnabledLayers,
    filters,
    palette: LAYER_COLORS,
  });

  // ── Data: boundary polygons ─────────────────────────────────────────────
  const countriesEnabled = enabledLayers.includes('countries');
  const citiesEnabled = enabledLayers.includes('cities');
  const neighbourhoodsEnabled = enabledLayers.includes('neighbourhoods');
  const { data: countryBoundaries } = useCountryBoundaries(countriesEnabled, currentZoom);
  const { data: cityBoundaries } = useCityBoundaries(citiesEnabled);
  const { data: neighbourhoodBoundaries } = useNeighbourhoodBoundaries(neighbourhoodsEnabled);

  // Merged counts for the layer toggle panel
  const layerCounts: Record<LayerType, number> = {
    ...areaLayerCounts,
    venues: pointLayerCounts.venues ?? 0,
    events: pointLayerCounts.events ?? 0,
    restrooms: pointLayerCounts.restrooms ?? 0,
    hotels: 0,
  };

  const isFetching = areaFetching || pointsFetching;

  // Surface loading state to the parent (spotlight rail skeleton).
  const onFetchingChangeRef = useRef(onFetchingChange);
  onFetchingChangeRef.current = onFetchingChange;
  useEffect(() => {
    onFetchingChangeRef.current?.(isFetching);
  }, [isFetching]);

  // ── Layer toggle ─────────────────────────────────────────────────────────
  const toggleLayer = useCallback(
    (layer: LayerType) => {
      setEnabledLayers((prev) => {
        const next = prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer];
        onLayersChangeProp?.(next);
        return next;
      });
    },
    [onLayersChangeProp],
  );

  // ── Geolocation ──────────────────────────────────────────────────────────
  const flyToLocation = useCallback((lng: number, lat: number, zoom = 12) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, speed: 1.5 });
  }, []);

  const { location: visitorGeo } = useVisitorLocation();

  useMapAutoFly({
    skipAutoFly,
    initialCenter,
    visitorGeo,
    flyToLocation,
    setViewport,
    showLocationHint,
  });

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

  // ── In-bounds count + spotlight-rail point set (debounced) ───────────────
  const { inBoundsCount, isCounterStale, setIsCounterStale, recomputeRef } = useInBoundsCount({
    mapRef,
    pointsGeoJSON,
    visitorGeo,
    favoriteIds,
    savedOnly,
    onPointsInViewRef,
  });

  // ── Popup management (native share + rich React-rendered popup card) ─────
  const { showPopup, showPopupFromMarker } = usePopupManager({
    navigate,
    toast,
    popupRef,
    popupRootRef,
  });

  // ── Spider markers (fanned-out co-located cluster leaves) ────────────────
  const { spiderfy, clearSpider } = useSpiderfy({ spiderMarkersRef, showPopup, onSelectPointRef });

  // ── Live pulse animation (Phase 4) ────────────────────────────────────────
  const { startPulse } = usePulseAnimation({ mapRef, mapReady, prefersReducedMotion, pulseRafRef });

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
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserLocation: true,
      }),
      'top-right',
    );

    if (linkToFullMap) map.scrollZoom.disable();

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
  }, [viewport, mapReady, initialCenter]);

  // ── Boundary polygon rendering via shared hook ─────────────────────────
  const countryMarkers = useMemo(
    () => areaMarkers.filter((m) => m.type === 'countries'),
    [areaMarkers],
  );
  const cityMarkers = useMemo(() => areaMarkers.filter((m) => m.type === 'cities'), [areaMarkers]);
  const villageMarkers = useMemo(
    () => areaMarkers.filter((m) => m.type === 'neighbourhoods'),
    [areaMarkers],
  );

  useMapBoundaryLayers({
    map: mapRef.current,
    mapReady,
    config: COUNTRY_BOUNDARY_CONFIG,
    boundaries: countryBoundaries,
    markers: countryMarkers,
    enabled: countriesEnabled,
    tooltipEl: tooltipRef.current,
    onPopup: showPopupFromMarker,
  });

  useMapBoundaryLayers({
    map: mapRef.current,
    mapReady,
    config: CITY_BOUNDARY_CONFIG,
    boundaries: cityBoundaries,
    markers: cityMarkers,
    enabled: citiesEnabled,
    tooltipEl: tooltipRef.current,
    onPopup: showPopupFromMarker,
  });

  useMapBoundaryLayers({
    map: mapRef.current,
    mapReady,
    config: NEIGHBOURHOOD_BOUNDARY_CONFIG,
    boundaries: neighbourhoodBoundaries,
    markers: villageMarkers,
    enabled: neighbourhoodsEnabled,
    tooltipEl: tooltipRef.current,
    onPopup: showPopupFromMarker,
  });

  // ── Area layer rendering (circles + labels) ─────────────────────────────
  useAreaLayers({
    mapRef,
    mapReady,
    areaMarkers,
    countryBoundaries,
    onPopup: showPopupFromMarker,
  });

  // ── Point layers: native MapLibre source with built-in clustering ──────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (pointEnabledLayers.length === 0) {
      if (pulseRafRef.current) {
        cancelAnimationFrame(pulseRafRef.current);
        pulseRafRef.current = null;
      }
      clearSpider();
      for (const id of PIN_LAYER_IDS) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(POINTS_SOURCE)) map.removeSource(POINTS_SOURCE);
      pointLayersAddedRef.current = false;
      return;
    }

    // Tag each feature with `favorited` (saved layer) and, when savedOnly is on,
    // keep only saved points. Clone properties so the hook's cached features
    // aren't mutated across map instances.
    const favSet = favoriteIds ?? EMPTY_FAV;
    const baseFeatures = pointsGeoJSON.features.filter((f) =>
      pointEnabledLayers.includes(f.properties.pointType),
    );
    const filteredGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: (savedOnly
        ? baseFeatures.filter((f) => favSet.has(String(f.properties.id)))
        : baseFeatures
      ).map((f) => ({
        ...f,
        properties: { ...f.properties, favorited: favSet.has(String(f.properties.id)) },
      })),
    };

    const existingSource = map.getSource(POINTS_SOURCE) as GeoJSONSource | undefined;
    if (existingSource) {
      mapDebug('setData', { features: filteredGeoJSON.features.length });
      existingSource.setData(filteredGeoJSON);
      return;
    }

    // Defer source + layer creation until we actually have features.
    // Adding a clustered source with `data: []` and then calling
    // `setData()` after the map's initial flyTo settle has been observed
    // to leave the cluster index empty — markers never appear even
    // though the data arrived. Waiting for non-empty data fixes that.
    if (filteredGeoJSON.features.length === 0) {
      mapDebug('skip-empty-source-create');
      return;
    }

    mapDebug('addSource', { features: filteredGeoJSON.features.length });
    map.addSource(POINTS_SOURCE, {
      type: 'geojson',
      data: filteredGeoJSON,
      cluster: true,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterRadius: CLUSTER_RADIUS,
      clusterProperties: {
        venue_count: ['+', ['case', ['==', ['get', 'pointType'], 'venues'], 1, 0]],
        event_count: ['+', ['case', ['==', ['get', 'pointType'], 'events'], 1, 0]],
        restroom_count: ['+', ['case', ['==', ['get', 'pointType'], 'restrooms'], 1, 0]],
        hotel_count: ['+', ['case', ['==', ['get', 'pointType'], 'hotels'], 1, 0]],
      },
    });

    // Segmented donut clusters — ring segments proportional to the cluster's
    // composition (what's inside, not just how much). Same layer id as the
    // old circle layer, so PIN_LAYER_IDS, the heatmap beforeId, and every
    // click/hover handler keep working. Icons come from `styleimagemissing`.
    map.addLayer({
      id: CLUSTERS_LAYER,
      type: 'symbol',
      source: POINTS_SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'icon-image': donutIconExpression(),
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });

    map.addLayer({
      id: CLUSTER_COUNT_LAYER,
      type: 'symbol',
      source: POINTS_SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Medium'],
        'text-size': 13,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      // Dark ink on the donut's white center disc.
      paint: { 'text-color': '#18181b' },
    });

    // Live pulse — an expanding ring beneath live/open-now pins. Static at
    // first; the rAF loop below animates radius+opacity when motion is allowed.
    map.addLayer({
      id: PULSE_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'live'], true]],
      paint: {
        'circle-radius': 10,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.25,
        'circle-stroke-width': 0,
      },
    });

    // Featured outer ring — makes editorially-chosen spots read first.
    map.addLayer({
      id: FEATURED_RING_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'featured'], true]],
      paint: {
        'circle-radius': 12,
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-width': 2,
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-opacity': 0.9,
      },
    });

    map.addLayer({
      id: UNCLUSTERED_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['!', ['has', 'point_count']],
      paint: {
        // Larger dots host the category glyph; featured sit a touch larger.
        // Radius grows slightly with zoom so pins don't feel undersized right
        // after a cluster expands into the (larger) donuts.
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11,
          ['case', ['==', ['get', 'featured'], true], 11, 9],
          16,
          ['case', ['==', ['get', 'featured'], true], 13, 11],
        ],
        'circle-color': ['get', 'color'],
        // Thicker white halo so pins separate cleanly from the colored
        // basemap and the (now softened) density heat beneath them.
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#ffffff',
        // Steady-state opacity = time-of-day expression (dims closed at night).
        'circle-opacity': pinOpacityExpr,
        // Entrance fade — opacity transitions in on first paint / data swap.
        'circle-opacity-transition': { duration: 350, delay: 0 },
      },
    });

    // Category glyph on top of the dot. Falls back to the venue glyph, then to
    // nothing (colored circle still shows) if an image failed to rasterize.
    map.addLayer({
      id: GLYPH_LAYER,
      type: 'symbol',
      source: POINTS_SOURCE,
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['coalesce', ['image', ['get', 'iconKey']], ['image', 'type:venues']],
        'icon-size': ['case', ['==', ['get', 'featured'], true], 0.5, 0.42],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });

    // Cluster click → zoom to expand, OR spiderfy when zooming won't separate
    // the points (they share ~identical coordinates).
    map.on('click', CLUSTERS_LAYER, async (e) => {
      const feat = e.features?.[0];
      if (!feat) return;
      clearSpider();
      const clusterId = feat.properties.cluster_id;
      const center = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
      const src = map.getSource(POINTS_SOURCE) as GeoJSONSource;
      try {
        const zoom = await src.getClusterExpansionZoom(clusterId);
        // If the breakpoint zoom is barely beyond where we are, zooming won't
        // visually separate the pins — fan them out instead.
        if (zoom - map.getZoom() <= 0.5 || zoom >= 18) {
          const leaves = (await src.getClusterLeaves(clusterId, 24, 0)) as PointFeature[];
          spiderfy(map, center, leaves);
        } else {
          map.flyTo({ center, zoom: zoom + 0.5, speed: 1.5 });
        }
      } catch {
        map.flyTo({ center, zoom: map.getZoom() + 2, speed: 1.5 });
      }
    });

    // Unclustered point click → rich popup card
    map.on('click', UNCLUSTERED_LAYER, (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat || feat.geometry.type !== 'Point') return;
      const summary = summaryFromFeature(feat as unknown as PointFeature);
      showPopup(map, e.lngLat, summary);
      onSelectPointRef.current?.(summary.id);
    });

    map.on('mouseenter', CLUSTERS_LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', CLUSTERS_LAYER, () => {
      map.getCanvas().style.cursor = '';
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;
    });

    // Cluster preview — break the aggregate down by type from clusterProperties
    // so a dense blob reads as "12 venues · 3 events" instead of just a number.
    map.on('mousemove', CLUSTERS_LAYER, (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const p = feat.properties as Record<string, number>;
      const html = clusterHoverHtml({
        venues: Number(p.venue_count) || 0,
        events: Number(p.event_count) || 0,
        restrooms: Number(p.restroom_count) || 0,
        hotels: Number(p.hotel_count) || 0,
        total: Number(p.point_count) || 0,
      });
      if (!hoverPopupRef.current) {
        hoverPopupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          maxWidth: '220px',
          className: 'venue-hover-popup',
        });
      }
      hoverPopupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
    });
    map.on('mouseenter', UNCLUSTERED_LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', UNCLUSTERED_LAYER, () => {
      map.getCanvas().style.cursor = '';
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;
    });

    // Lightweight hover preview: name + subtitle, no close button, no action
    // buttons. Click still opens the full popup with share/navigate.
    map.on('mousemove', UNCLUSTERED_LAYER, (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat || feat.geometry.type !== 'Point') return;
      const props = feat.properties as Record<string, unknown>;
      const name = String(props.name ?? '');
      const subtitle = props.subtitle ? String(props.subtitle) : '';
      let imageUrl = '';
      try {
        const meta = JSON.parse(String(props.meta ?? '{}'));
        // Prefer the reachable R2-mirrored copy over the raw external hotlink.
        const best = [meta.thumbImage, meta.optimizedImage, meta.image].find(
          (u) => typeof u === 'string' && /^https?:\/\//.test(u),
        );
        if (best) imageUrl = best as string;
      } catch {
        /* ignore */
      }
      const html = pointHoverHtml({ name, subtitle, imageUrl: imageUrl || undefined });
      if (!hoverPopupRef.current) {
        hoverPopupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          maxWidth: '220px',
          className: 'venue-hover-popup',
        });
      }
      hoverPopupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map);
    });

    // Entrance fade — pins ease in on first paint (skipped for reduced motion),
    // settling on the time-of-day opacity expression.
    if (!prefersReducedMotion && map.getLayer(UNCLUSTERED_LAYER)) {
      map.setPaintProperty(UNCLUSTERED_LAYER, 'circle-opacity', 0);
      requestAnimationFrame(() => {
        const m = mapRef.current;
        if (m?.getLayer(UNCLUSTERED_LAYER))
          m.setPaintProperty(UNCLUSTERED_LAYER, 'circle-opacity', pinOpacityExpr);
      });
    }

    startPulse();
    pointLayersAddedRef.current = true;
  }, [
    pointsGeoJSON,
    pointEnabledLayers,
    mapReady,
    showPopup,
    startPulse,
    prefersReducedMotion,
    pinOpacityExpr,
    favoriteIds,
    savedOnly,
    spiderfy,
    clearSpider,
  ]);

  // ── Heatmap layer (Density lens): monochrome black-alpha ramp ─────────
  // MUST stay declared after the pins effect (load-bearing `beforeId` z-order).
  useHeatmapLayer({
    mapRef,
    mapReady,
    renderMode,
    pointsGeoJSON,
    pointEnabledLayers,
    prefersReducedMotion,
  });

  // ── Focus ring (rail hover / selection) ──────────────────────────────────
  useFocusRing({ mapRef, mapReady, selectedId, highlightedId, pointsGeoJSON });

  // ── Selection → fly to + open popup ───────────────────────────────────────
  useSelectionFlyer({ mapRef, mapReady, selectedId, pointsGeoJSON, showPopup });

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className={`relative rounded-container overflow-hidden border border-border ${className ?? ''}`}
      style={{ height }}
    >
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* Lightweight hover tooltip for boundary polygons */}
      <div
        ref={tooltipRef}
        className="hidden absolute pointer-events-none z-20 bg-background text-foreground whitespace-nowrap pl-2.5 pr-2.5"
        style={{ paddingTop: 5, paddingBottom: 5, fontSize: 13 }}
      />

      {/* Visually-hidden list of currently-visible markers — alternative
          presentation for screen readers and keyboard users (WCAG 1.3.1 / 2.1.1).
          The map canvas itself can't expose individual pins to AT, so this
          mirrors them as a flat list of links updated on each fetch.
          `role="region"` is not allowed on <ul>; use a labelled <nav>
          landmark wrapper instead (axe aria-allowed-role). */}
      <nav className="sr-only" aria-label="Visible map results">
        <ul>
          {pointsGeoJSON.features.slice(0, 200).map((f) => {
            const p = f.properties;
            const href = p.linkTo || undefined;
            const label = p.subtitle ? `${p.name} — ${p.subtitle}` : p.name;
            return <li key={p.id}>{href ? <a href={href}>{label}</a> : <span>{label}</span>}</li>;
          })}
          {areaMarkers.slice(0, 200).map((m) => (
            <li key={m.id}>{m.linkTo ? <a href={m.linkTo}>{m.name}</a> : <span>{m.name}</span>}</li>
          ))}
        </ul>
      </nav>

      {/* Loading overlay */}
      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-background opacity-70 z-[5]">
          <Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" />
        </div>
      )}

      {/* Layer toggles */}
      {showLayerToggles && (
        <ExploreMapLayers
          enabledLayers={enabledLayers}
          onToggle={toggleLayer}
          layerCounts={layerCounts}
          compact={!!linkToFullMap}
        />
      )}

      {/* Fetching indicator + result count */}
      <MapResultsPill
        showResultCount={showResultCount}
        isFetching={isFetching}
        isCounterStale={isCounterStale}
        inBoundsCount={inBoundsCount}
      />

      {/* Ambient location hint */}
      <LocationHint hint={locationHint} />

      {/* Queer-voiced empty state (MapShell only) */}
      <MapEmptyState
        visible={
          mapShellMode &&
          mapReady &&
          !isFetching &&
          !isCounterStale &&
          inBoundsCount === 0 &&
          pointEnabledLayers.length > 0
        }
        filters={filters}
      />

      {/* "Open full map" link for embedded previews */}
      {linkToFullMap && (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Open full map"
          onClick={() => navigate(linkToFullMap)}
          className="absolute bottom-3 left-3 z-10 min-w-0 px-4 py-1.5 rounded-full border border-border normal-case text-xs leading-tight bg-background/85 hover:bg-background"
        >
          <ExternalLink size={14} />
          <span className="hidden sm:inline ml-1">Full map</span>
        </Button>
      )}

      {/* Filters bar */}
      {showFilters && <ExploreMapFiltersPanel filters={filters} onFiltersChange={setFilters} />}
    </div>
  );
};

export default ExploreMap;
