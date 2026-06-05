/* eslint-disable react-hooks/refs -- map components pass MapLibre ref.current (the imperative map handle) into custom hooks during render; this is the documented MapLibre integration pattern. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import i18next from 'i18next';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { mapStyle } from '@/config/mapStyle';
import {
  useExploreMapData,
  type LayerType,
  type MapViewport,
  type ExploreMapFilters,
  type MapMarker,
  LAYER_COLORS,
  PRIDE_LAYER_COLORS,
} from '@/hooks/useExploreMapData';
import { useViewportPoints, POINT_LAYER_TYPES } from '@/hooks/useViewportPoints';
import { ExploreMapLayers, LAYER_DEFS } from '@/components/map/ExploreMapLayers';
import { ExploreMapFiltersPanel } from '@/components/map/ExploreMapFilters';
import { renderPopupHTML } from '@/components/map/ExploreMapPopup';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { hapticTrigger } from '@/hooks/useHaptics';
import { useToast } from '@/hooks/use-toast';
import { CLUSTER_MAX_ZOOM, CLUSTER_RADIUS, clampBbox, type Bbox } from '@/utils/mapViewport';
import {
  useCountryBoundaries,
  useCityBoundaries,
  useNeighbourhoodBoundaries,
} from '@/hooks/useBoundaryData';
import { useMapBoundaryLayers, type BoundaryLayerConfig } from '@/hooks/useMapBoundaryLayers';
import { heatmapRenderPlan, type RenderMode } from './mapShellAdapters';

// ── Layer classification ─────────────────────────────────────────────────────

/** Layers rendered as native MapLibre circle + label layers (area feel) */
// eslint-disable-next-line react-refresh/only-export-components
export const AREA_LAYERS: LayerType[] = ['cities', 'countries', 'neighbourhoods'];

/** Circle radius interpolation stops per area type: [zoom, radiusPx][] */
const AREA_RADIUS: Record<string, [number, number][]> = {
  countries: [
    [1, 8],
    [3, 18],
    [5, 40],
    [7, 80],
    [9, 150],
    [12, 280],
  ],
  cities: [
    [2, 4],
    [4, 8],
    [6, 16],
    [8, 28],
    [10, 45],
    [14, 75],
  ],
  neighbourhoods: [
    [2, 3],
    [4, 6],
    [6, 12],
    [8, 22],
    [10, 38],
    [14, 60],
  ],
};

/** Circle style per area type */
const AREA_STYLE: Record<string, { opacity: number; strokeOpacity: number; minLabelZoom: number }> =
  {
    countries: { opacity: 0.2, strokeOpacity: 0.55, minLabelZoom: 1 },
    cities: { opacity: 0.25, strokeOpacity: 0.6, minLabelZoom: 3 },
    neighbourhoods: { opacity: 0.3, strokeOpacity: 0.7, minLabelZoom: 6 },
  };

// ── MapLibre layer IDs for point data ────────────────────────────────────────

const POINTS_SOURCE = 'points-source';
const CLUSTERS_LAYER = 'clusters';
const CLUSTER_COUNT_LAYER = 'cluster-count';
const UNCLUSTERED_LAYER = 'unclustered-point';
const HEATMAP_SOURCE = 'heatmap-source';
const HEATMAP_LAYER = 'heatmap-layer';

// ── Boundary configs ─────────────────────────────────────────────────────────

const COUNTRY_BOUNDARY_CONFIG: BoundaryLayerConfig = {
  key: 'countries',
  entityType: 'countries',
  matchKey: 'ISO_A2',
  matchMode: 'code',
  minLabelZoom: 1,
};

const CITY_BOUNDARY_CONFIG: BoundaryLayerConfig = {
  key: 'cities',
  entityType: 'cities',
  matchKey: 'entity_id',
  matchMode: 'entityId',
  minLabelZoom: 4,
  minLayerZoom: 4,
};

const NEIGHBOURHOOD_BOUNDARY_CONFIG: BoundaryLayerConfig = {
  key: 'neighbourhoods',
  entityType: 'neighbourhoods',
  matchKey: 'entity_id',
  matchMode: 'entityId',
  minLabelZoom: 8,
  minLayerZoom: 8,
};

// ── Default props ──────────────────────────────────────────────────────────────

const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 2.2;

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
  /** Use the pride-spectrum canvas palette (markers, area circles, density
   *  heat). Gated to MapShell; legacy/embedded maps stay on LAYER_COLORS. */
  pridePalette?: boolean;
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
  pridePalette = false,
}: ExploreMapProps) => {
  const navigate = useLocalizedNavigate();
  const { toast } = useToast();

  // ── Map refs ─────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const areaLayerIdsRef = useRef<Set<string>>(new Set());
  const pointLayersAddedRef = useRef(false);

  // ── State ────────────────────────────────────────────────────────────────
  const [mapReady, setMapReady] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(initialZoom ?? DEFAULT_ZOOM);
  // Count of currently-rendered point features inside the visible map
  // bounds. Recomputed on moveend (debounced) so the "X results in view"
  // counter matches what the user actually sees, not the padded fetch
  // bbox.
  const [inBoundsCount, setInBoundsCount] = useState(0);
  // True from the instant the user starts panning/zooming until the next
  // count recomputes. Without this the pill shows the OLD count for the
  // 100-200ms debounce window, which reads as "the map is lying."
  const [isCounterStale, setIsCounterStale] = useState(false);

  const [enabledLayers, setEnabledLayers] = useState<LayerType[]>(
    () =>
      defaultLayers ?? LAYER_DEFS.filter((d) => d.defaultOn && !d.comingSoon).map((d) => d.type),
  );

  const [viewport, setViewport] = useState<MapViewport>({
    center: initialCenter ?? DEFAULT_CENTER,
    zoom: initialZoom ?? DEFAULT_ZOOM,
  });

  const [filters, setFilters] = useState<ExploreMapFilters>(defaultFilters ?? {});

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
    palette: pridePalette ? PRIDE_LAYER_COLORS : LAYER_COLORS,
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

  // Berlin — used as a curated fallback when neither URL state, an
  // explicit prop, nor IP geolocation provides a center within ~2.5 s.
  // Avoids the cold-load Sahara view (DEFAULT_CENTER = [0, 20] is in the
  // empty desert and shows no markers, which reads as "the site is broken").
  const FALLBACK_CENTER: [number, number] = [13.405, 52.52];
  const FALLBACK_ZOOM = 10;
  // Berlin fallback fired (cosmetic, prevents repeat toast).
  const fallbackFiredRef = useRef(false);
  // True only when we flew to the *user's* real location. Berlin fallback
  // does NOT set this, so a late-arriving visitorGeo still overrides Berlin.
  const userGeoFiredRef = useRef(false);

  useEffect(() => {
    if (skipAutoFly || initialCenter || !visitorGeo) return;
    if (userGeoFiredRef.current) return;
    userGeoFiredRef.current = true;
    setViewport({ center: [visitorGeo.longitude, visitorGeo.latitude], zoom: 10 });
    flyToLocation(visitorGeo.longitude, visitorGeo.latitude, 10);
    toast({
      title: 'Showing your area',
      description: visitorGeo.city ?? undefined,
    });
  }, [visitorGeo, flyToLocation, skipAutoFly, initialCenter, toast]);

  useEffect(() => {
    if (skipAutoFly || initialCenter || fallbackFiredRef.current) return;
    const timer = setTimeout(() => {
      if (visitorGeo || fallbackFiredRef.current || userGeoFiredRef.current) return;
      fallbackFiredRef.current = true;
      setViewport({ center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM });
      flyToLocation(FALLBACK_CENTER[0], FALLBACK_CENTER[1], FALLBACK_ZOOM);
      toast({
        title: 'Showing Berlin',
        description: 'Search to change',
      });
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipAutoFly, initialCenter]);

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

  // ── Helper: recompute in-bounds count (debounced) ────────────────────────
  // The padded fetch returns 15% more features than the visible viewport
  // (for cache reuse). The counter should reflect what the user actually
  // sees on the map. Debounce on moveend to avoid thrash during panning.
  const inBoundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recomputeInBoundsCount = useCallback(() => {
    if (inBoundsTimerRef.current) clearTimeout(inBoundsTimerRef.current);
    inBoundsTimerRef.current = setTimeout(() => {
      const map = mapRef.current;
      if (!map) return;
      const b = map.getBounds();
      const w = b.getWest();
      const e = b.getEast();
      const s = b.getSouth();
      const n = b.getNorth();
      let count = 0;
      for (const f of pointsGeoJSON.features) {
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
        if (lng >= w && lng <= e && lat >= s && lat <= n) count++;
      }
      setInBoundsCount(count);
      setIsCounterStale(false);
    }, 100);
  }, [pointsGeoJSON]);

  // Recompute whenever the fetched data changes (not just on pan).
  useEffect(() => {
    recomputeInBoundsCount();
  }, [pointsGeoJSON, recomputeInBoundsCount]);

  useEffect(() => {
    return () => {
      if (inBoundsTimerRef.current) clearTimeout(inBoundsTimerRef.current);
    };
  }, []);

  // ── Helper: show popup with navigation ───────────────────────────────────
  const showPopup = useCallback(
    (map: maplibregl.Map, lngLat: maplibregl.LngLat, marker: MapMarker) => {
      hapticTrigger('nudge');
      popupRef.current?.remove();
      const popup = new maplibregl.Popup({ offset: 15, closeButton: true, maxWidth: '260px' })
        .setLngLat(lngLat)
        .setHTML(renderPopupHTML(marker))
        .addTo(map);

      popup.on('open', () => {
        const el = popup.getElement();
        const link = el?.querySelector('a[href^="/"]');
        if (link) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = (e.currentTarget as HTMLAnchorElement).getAttribute('href');
            if (href) navigate(href);
          });
        }

        const shareBtn = el?.querySelector('button[data-share-id]');
        if (shareBtn) {
          shareBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            hapticTrigger('nudge');
            const btn = e.currentTarget as HTMLButtonElement;
            const name = btn.getAttribute('data-share-name') ?? '';
            const subtitle = btn.getAttribute('data-share-subtitle') ?? '';
            const path = btn.getAttribute('data-share-url') ?? '';
            const absoluteUrl = new URL(path, window.location.origin).toString();
            const payload = { title: name, text: subtitle || name, url: absoluteUrl };

            const fallbackToClipboard = async () => {
              try {
                await navigator.clipboard.writeText(absoluteUrl);
                toast({
                  title: i18next.t('map.popup.linkCopied', { defaultValue: 'Link copied' }),
                  description: i18next.t('map.popup.linkCopiedDescription', {
                    defaultValue: 'You can paste it now',
                  }),
                });
              } catch {
                toast({
                  title: i18next.t('map.popup.shareFailed', { defaultValue: 'Share failed' }),
                  variant: 'destructive',
                });
              }
            };

            if (typeof navigator.share === 'function') {
              try {
                await navigator.share(payload);
              } catch (err) {
                if ((err as { name?: string })?.name === 'AbortError') return;
                console.error('navigator.share failed', err);
                await fallbackToClipboard();
              }
            } else {
              await fallbackToClipboard();
            }
          });
        }
      });

      popupRef.current = popup;
    },
    [navigate, toast],
  );

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

    map.on('load', () => {
      setMapReady(true);

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
      recomputeInBoundsCount();
    });

    return () => {
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
    onPopup: showPopup,
  });

  useMapBoundaryLayers({
    map: mapRef.current,
    mapReady,
    config: CITY_BOUNDARY_CONFIG,
    boundaries: cityBoundaries,
    markers: cityMarkers,
    enabled: citiesEnabled,
    tooltipEl: tooltipRef.current,
    onPopup: showPopup,
  });

  useMapBoundaryLayers({
    map: mapRef.current,
    mapReady,
    config: NEIGHBOURHOOD_BOUNDARY_CONFIG,
    boundaries: neighbourhoodBoundaries,
    markers: villageMarkers,
    enabled: neighbourhoodsEnabled,
    tooltipEl: tooltipRef.current,
    onPopup: showPopup,
  });

  // ── Area layer rendering (circles + labels) ─────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Skip circles for types that have polygon boundaries
    const skipCircleTypes: string[] = [];
    if (countryBoundaries) skipCircleTypes.push('countries');
    const activeAreaLayers = AREA_LAYERS.filter((t) => !skipCircleTypes.includes(t));

    const onlyArea = areaMarkers.filter((m) => activeAreaLayers.includes(m.type));
    const grouped: Record<string, MapMarker[]> = {};
    for (const type of AREA_LAYERS) grouped[type] = onlyArea.filter((m) => m.type === type);

    const activeIds = new Set<string>();

    for (const type of AREA_LAYERS) {
      const items = grouped[type] ?? [];
      const sourceId = `area-source-${type}`;
      const circleLayerId = `area-circle-${type}`;
      const labelLayerId = `area-label-${type}`;

      if (items.length === 0) {
        if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
        if (map.getLayer(circleLayerId)) map.removeLayer(circleLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        areaLayerIdsRef.current.delete(sourceId);
        continue;
      }

      activeIds.add(sourceId);

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: items.map((m) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
          properties: {
            id: m.id,
            name: m.name,
            subtitle: m.subtitle ?? '',
            color: m.color,
            linkTo: m.linkTo ?? '',
            markerType: m.type,
            ...Object.fromEntries(
              Object.entries(m.meta ?? {}).map(([k, v]) => [
                `meta_${k}`,
                typeof v === 'object' ? JSON.stringify(v) : v,
              ]),
            ),
          },
        })),
      };

      const style = AREA_STYLE[type] ?? AREA_STYLE.cities;
      const radii = AREA_RADIUS[type] ?? AREA_RADIUS.cities;
      const palette = pridePalette ? PRIDE_LAYER_COLORS : LAYER_COLORS;
      const color = palette[type as LayerType] ?? '#888';

      const radiusExpr: unknown[] = ['interpolate', ['linear'], ['zoom']];
      for (const [z, r] of radii) radiusExpr.push(z, r);

      const existingSource = map.getSource(sourceId) as GeoJSONSource | undefined;
      if (existingSource) {
        existingSource.setData(geojson);
      } else {
        map.addSource(sourceId, { type: 'geojson', data: geojson });

        map.addLayer({
          id: circleLayerId,
          type: 'circle',
          source: sourceId,
          paint: {
            'circle-radius': radiusExpr as maplibregl.ExpressionSpecification,
            'circle-color': color,
            'circle-opacity': style.opacity,
            'circle-stroke-color': color,
            'circle-stroke-width': 2,
            'circle-stroke-opacity': style.strokeOpacity,
          },
        });

        map.addLayer({
          id: labelLayerId,
          type: 'symbol',
          source: sourceId,
          minzoom: style.minLabelZoom,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 12, 10, 14],
            'text-font': ['Noto Sans Medium'],
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'text-anchor': 'center',
          },
          paint: {
            'text-color': '#1e293b',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
            'text-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              style.minLabelZoom,
              0,
              style.minLabelZoom + 0.5,
              1,
            ],
          },
        });

        map.on('mouseenter', circleLayerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', circleLayerId, () => {
          map.getCanvas().style.cursor = '';
        });
        map.on('click', circleLayerId, (e: MapLayerMouseEvent) => {
          const feat = e.features?.[0];
          if (!feat || feat.geometry.type !== 'Point') return;
          const props = feat.properties as Record<string, unknown>;
          const meta: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props)) {
            if (k.startsWith('meta_')) {
              try {
                meta[k.slice(5)] = JSON.parse(v);
              } catch {
                meta[k.slice(5)] = v;
              }
            }
          }
          showPopup(map, e.lngLat, {
            id: props.id,
            type: props.markerType as LayerType,
            lat: (feat.geometry as GeoJSON.Point).coordinates[1],
            lng: (feat.geometry as GeoJSON.Point).coordinates[0],
            name: props.name,
            subtitle: props.subtitle || undefined,
            color: props.color,
            linkTo: props.linkTo || undefined,
            meta,
          });
        });

        areaLayerIdsRef.current.add(sourceId);
      }
    }

    // Clean up stale area layers
    for (const oldId of [...areaLayerIdsRef.current]) {
      if (!activeIds.has(oldId)) {
        const t = oldId.replace('area-source-', '');
        if (map.getLayer(`area-label-${t}`)) map.removeLayer(`area-label-${t}`);
        if (map.getLayer(`area-circle-${t}`)) map.removeLayer(`area-circle-${t}`);
        if (map.getSource(oldId)) map.removeSource(oldId);
        areaLayerIdsRef.current.delete(oldId);
      }
    }
  }, [areaMarkers, mapReady, showPopup, countryBoundaries, pridePalette]);

  // ── Point layers: native MapLibre source with built-in clustering ──────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (pointEnabledLayers.length === 0) {
      if (map.getLayer(CLUSTER_COUNT_LAYER)) map.removeLayer(CLUSTER_COUNT_LAYER);
      if (map.getLayer(CLUSTERS_LAYER)) map.removeLayer(CLUSTERS_LAYER);
      if (map.getLayer(UNCLUSTERED_LAYER)) map.removeLayer(UNCLUSTERED_LAYER);
      if (map.getSource(POINTS_SOURCE)) map.removeSource(POINTS_SOURCE);
      pointLayersAddedRef.current = false;
      return;
    }

    const filteredGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: pointsGeoJSON.features.filter((f) =>
        pointEnabledLayers.includes(f.properties.pointType),
      ),
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
      },
    });

    map.addLayer({
      id: CLUSTERS_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26, 100, 32, 500, 40],
        // Monochrome cluster ramp. Density encoded by alpha on the
        // foreground token, not by hue — matches the heatmap ramp and
        // the rest of the design system's no-color rule.
        'circle-color': 'hsl(0 0% 4%)',
        'circle-opacity': [
          'step',
          ['get', 'point_count'],
          0.55,
          10,
          0.65,
          50,
          0.75,
          100,
          0.85,
          500,
          0.95,
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'hsl(0 0% 100%)',
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
      },
      paint: { 'text-color': '#ffffff' },
    });

    map.addLayer({
      id: UNCLUSTERED_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': 7,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.9,
      },
    });

    // Cluster click → zoom
    map.on('click', CLUSTERS_LAYER, async (e) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const clusterId = feat.properties.cluster_id;
      const src = map.getSource(POINTS_SOURCE) as GeoJSONSource;
      try {
        const zoom = await src.getClusterExpansionZoom(clusterId);
        map.flyTo({
          center: (feat.geometry as GeoJSON.Point).coordinates as [number, number],
          zoom: zoom + 0.5,
          speed: 1.5,
        });
      } catch {
        map.flyTo({
          center: (feat.geometry as GeoJSON.Point).coordinates as [number, number],
          zoom: map.getZoom() + 2,
          speed: 1.5,
        });
      }
    });

    // Unclustered point click → popup
    map.on('click', UNCLUSTERED_LAYER, (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat || feat.geometry.type !== 'Point') return;
      const props = feat.properties as Record<string, unknown>;
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(props.meta ?? '{}');
      } catch {
        /* ignore */
      }

      showPopup(map, e.lngLat, {
        id: props.id,
        type: props.pointType as LayerType,
        lat: (feat.geometry as GeoJSON.Point).coordinates[1],
        lng: (feat.geometry as GeoJSON.Point).coordinates[0],
        name: props.name,
        subtitle: props.subtitle || undefined,
        color: props.color,
        linkTo: props.linkTo || undefined,
        meta,
      });
    });

    map.on('mouseenter', CLUSTERS_LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', CLUSTERS_LAYER, () => {
      map.getCanvas().style.cursor = '';
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
      const safeName = name.replace(
        /[&<>"]/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
      );
      const safeSub = subtitle.replace(
        /[&<>"]/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
      );
      const html = `<div style="font:13px system-ui;line-height:1.3;padding:2px 4px;max-width:200px"><div style="font-weight:600">${safeName}</div>${
        safeSub
          ? `<div style="color:rgba(0,0,0,.6);font-size:11px;margin-top:2px">${safeSub}</div>`
          : ''
      }</div>`;
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

    pointLayersAddedRef.current = true;
  }, [pointsGeoJSON, pointEnabledLayers, mapReady, showPopup]);

  // ── Heatmap layer (Density lens): monochrome black-alpha ramp ─────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const { wantHeatmap, hidePins } = heatmapRenderPlan(
      renderMode,
      pointEnabledLayers.length > 0,
    );

    if (!wantHeatmap) {
      if (map.getLayer(HEATMAP_LAYER)) map.removeLayer(HEATMAP_LAYER);
      if (map.getSource(HEATMAP_SOURCE)) map.removeSource(HEATMAP_SOURCE);
      // Restore cluster/pin layer visibility
      for (const id of [CLUSTERS_LAYER, CLUSTER_COUNT_LAYER, UNCLUSTERED_LAYER]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
      }
      return;
    }

    // Pure density (`heatmap`) hides the pins; `combined` keeps them on top.
    const pinVisibility = hidePins ? 'none' : 'visible';
    for (const id of [CLUSTERS_LAYER, CLUSTER_COUNT_LAYER, UNCLUSTERED_LAYER]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', pinVisibility);
    }

    const filteredGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: pointsGeoJSON.features.filter((f) =>
        pointEnabledLayers.includes(f.properties.pointType),
      ),
    };

    const existing = map.getSource(HEATMAP_SOURCE) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(filteredGeoJSON);
      return;
    }

    map.addSource(HEATMAP_SOURCE, { type: 'geojson', data: filteredGeoJSON });
    // Insert beneath the pin/cluster layers so markers stay on top in the
    // combined lens. `beforeId` is undefined when pins aren't mounted yet
    // (pure-density), which appends on top exactly as before.
    // Z-order: the pins effect is declared *before* this heatmap effect, so it
    // runs first within a commit — CLUSTERS_LAYER usually exists by now and
    // beforeId slots the heatmap below the pins. Cold-start window (layers
    // enabled but zero features → pins effect skips layer creation): beforeId
    // is undefined and the heatmap appends on top, but once data arrives the
    // pins effect adds the cluster layers ABOVE this heatmap (and this effect
    // early-returns via setData without re-inserting). Pins end up on top in
    // every path. Don't reorder the two effects.
    const beforeId = map.getLayer(CLUSTERS_LAYER) ? CLUSTERS_LAYER : undefined;
    map.addLayer({
      id: HEATMAP_LAYER,
      type: 'heatmap',
      source: HEATMAP_SOURCE,
      maxzoom: 16,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 9, 2],
        // Pride-spectrum density ramp (MapShell) reads "density of queer
        // life" as a rainbow heat field; legacy maps keep the monochrome
        // black-alpha ramp (design system: no hue, no shadow).
        'heatmap-color': pridePalette
          ? [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,
              'rgba(117,7,135,0)', // transparent violet
              0.2,
              'rgba(0,77,255,0.55)', // blue
              0.4,
              'rgba(0,128,38,0.65)', // green
              0.6,
              'rgba(255,237,0,0.75)', // yellow
              0.8,
              'rgba(255,140,0,0.85)', // orange
              1,
              'rgba(228,3,3,0.92)', // red
            ]
          : [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,
              'rgba(0,0,0,0)',
              0.2,
              'rgba(0,0,0,0.15)',
              0.4,
              'rgba(0,0,0,0.30)',
              0.6,
              'rgba(0,0,0,0.50)',
              0.8,
              'rgba(0,0,0,0.70)',
              1,
              'rgba(0,0,0,0.85)',
            ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 6, 9, 28, 14, 60],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.85, 14, 0.65, 16, 0],
      },
    }, beforeId);
  }, [renderMode, pointsGeoJSON, pointEnabledLayers, mapReady, pridePalette]);

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

      {/* Fetching indicator + result count.
          Sits above MapLibre's bottom-right AttributionControl (~24px tall);
          bottom: 40 keeps the pill clear of the © Protomaps © OSM text. */}
      <div
        className="absolute z-10 flex items-center gap-1.5 rounded-full border border-border bg-background/85 px-4 py-1.5 pointer-events-none transition-opacity duration-200"
        style={{
          bottom: 40,
          right: 8,
          opacity: isFetching || isCounterStale || inBoundsCount > 0 ? 1 : 0,
        }}
      >
        {(isFetching || isCounterStale) && (
          <Loader2 className="h-3 w-3 animate-spin" aria-label="Loading" />
        )}
        <span className="text-xs text-muted-foreground">
          {isFetching || isCounterStale
            ? 'Loading...'
            : `${inBoundsCount.toLocaleString()} results in view`}
        </span>
      </div>

      {/* Queer-voiced empty state (MapShell only). Shows when the area has no
          points and we're not mid-fetch — warmer than a hidden zero pill. */}
      {pridePalette &&
        mapReady &&
        !isFetching &&
        !isCounterStale &&
        inBoundsCount === 0 &&
        pointEnabledLayers.length > 0 && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 flex justify-center px-4 pointer-events-none">
            <p className="max-w-xs text-center text-sm text-muted-foreground bg-background/85 border border-border rounded-element px-4 py-2">
              No spots here yet — pan, zoom out, or put one on the map.
            </p>
          </div>
        )}

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
