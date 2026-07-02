/* eslint-disable react-hooks/refs -- map components pass MapLibre ref.current (the imperative map handle) into custom hooks during render; this is the documented MapLibre integration pattern. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Root } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { type MapPointSummary } from './mapPoint';
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
import { useMapInstance } from '@/components/map/hooks/useMapInstance';
import { usePointLayers } from '@/components/map/hooks/usePointLayers';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { useToast } from '@/hooks/use-toast';
import {
  useCountryBoundaries,
  useCityBoundaries,
  useNeighbourhoodBoundaries,
} from '@/hooks/useBoundaryData';
import { useMapBoundaryLayers } from '@/hooks/useMapBoundaryLayers';
import { type RenderMode } from './mapShellAdapters';
import {
  AREA_LAYERS,
  COUNTRY_BOUNDARY_CONFIG,
  CITY_BOUNDARY_CONFIG,
  NEIGHBOURHOOD_BOUNDARY_CONFIG,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
} from '@/config/mapLayers';

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
  /** Render MapLibre's native zoom/geolocate buttons (default). MapShell sets
   *  false and mounts its own design-system MapNavControls cluster instead —
   *  the native GeolocateControl stays mounted (hidden) because it owns the
   *  blue tracking dot. */
  showNativeNav?: boolean;
  /** Receives an imperative handle (map + geolocate trigger) on load, null on
   *  teardown. Powers MapShell's custom nav controls. */
  onMapHandle?: (handle: ExploreMapHandle | null) => void;
}

/** Imperative handle passed up via `onMapHandle`. */
export interface ExploreMapHandle {
  map: maplibregl.Map;
  geolocateControl: maplibregl.GeolocateControl;
  /** Fly to the viewer's location (native GeolocateControl trigger). */
  triggerGeolocate: () => boolean;
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
  showNativeNav = true,
  onMapHandle,
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
  const onMapHandleRef = useRef(onMapHandle);
  onMapHandleRef.current = onMapHandle;

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

  // ── Map lifecycle (construct + controls + handlers + teardown + initial fly)
  useMapInstance({
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
  });

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
  usePointLayers({
    mapRef,
    mapReady,
    pointsGeoJSON,
    pointEnabledLayers,
    prefersReducedMotion,
    pinOpacityExpr,
    favoriteIds,
    savedOnly,
    showPopup,
    startPulse,
    spiderfy,
    clearSpider,
    onSelectPointRef,
    pointLayersAddedRef,
    pulseRafRef,
  });

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
      className={`relative rounded-container overflow-hidden border border-border ${
        showNativeNav ? '' : 'qg-hide-native-nav '
      }${className ?? ''}`}
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
