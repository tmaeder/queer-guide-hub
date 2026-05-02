import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ExternalLink } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { mapStyle } from '@/config/mapStyle';
import {
  useExploreMapData,
  type LayerType,
  type MapViewport,
  type ExploreMapFilters,
  type MapMarker,
  LAYER_COLORS,
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

// ── Layer classification ─────────────────────────────────────────────────────

/** Layers rendered as native MapLibre circle + label layers (area feel) */
// eslint-disable-next-line react-refresh/only-export-components
export const AREA_LAYERS: LayerType[] = ['cities', 'countries', 'neighbourhoods'];

/** Circle radius interpolation stops per area type: [zoom, radiusPx][] */
const AREA_RADIUS: Record<string, [number, number][]> = {
  countries: [[1, 8], [3, 18], [5, 40], [7, 80], [9, 150], [12, 280]],
  cities: [[2, 4], [4, 8], [6, 16], [8, 28], [10, 45], [14, 75]],
  neighbourhoods: [[2, 3], [4, 6], [6, 12], [8, 22], [10, 38], [14, 60]],
};

/** Circle style per area type */
const AREA_STYLE: Record<string, { opacity: number; strokeOpacity: number; minLabelZoom: number }> = {
  countries: { opacity: 0.2, strokeOpacity: 0.55, minLabelZoom: 1 },
  cities: { opacity: 0.25, strokeOpacity: 0.6, minLabelZoom: 3 },
  neighbourhoods: { opacity: 0.3, strokeOpacity: 0.7, minLabelZoom: 6 },
};

// ── MapLibre layer IDs for point data ────────────────────────────────────────

const POINTS_SOURCE = 'points-source';
const CLUSTERS_LAYER = 'clusters';
const CLUSTER_COUNT_LAYER = 'cluster-count';
const UNCLUSTERED_LAYER = 'unclustered-point';

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
}

// ── Component ──────────────────────────────────────────────────────────────────

export const ExploreMap: React.FC<ExploreMapProps> = ({
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
}) => {
  const navigate = useLocalizedNavigate();
  const { toast } = useToast();

  // ── Map refs ─────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const areaLayerIdsRef = useRef<Set<string>>(new Set());
  const pointLayersAddedRef = useRef(false);

  // ── State ────────────────────────────────────────────────────────────────
  const [mapReady, setMapReady] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(initialZoom ?? DEFAULT_ZOOM);

  const [enabledLayers, setEnabledLayers] = useState<LayerType[]>(
    () => defaultLayers ?? LAYER_DEFS.filter((d) => d.defaultOn && !d.comingSoon).map((d) => d.type),
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
    totalCount: pointsTotalCount,
    isFetching: pointsFetching,
    layerCounts: pointLayerCounts,
    onViewportChange,
  } = useViewportPoints({ enabledLayers: pointEnabledLayers, filters });

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
  const toggleLayer = useCallback((layer: LayerType) => {
    setEnabledLayers((prev) =>
      prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer],
    );
  }, []);

  // ── Geolocation ──────────────────────────────────────────────────────────
  const flyToLocation = useCallback((lng: number, lat: number, zoom = 12) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, speed: 1.5 });
  }, []);

  const { location: visitorGeo } = useVisitorLocation();

  useEffect(() => {
    if (skipAutoFly || initialCenter || !visitorGeo) return;
    setViewport({ center: [visitorGeo.longitude, visitorGeo.latitude], zoom: 10 });
    flyToLocation(visitorGeo.longitude, visitorGeo.latitude, 10);
  }, [visitorGeo, flyToLocation, skipAutoFly, initialCenter]);

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
                  title: 'Link kopiert / Link copied',
                  description: 'Du kannst ihn jetzt einfügen / You can paste it now',
                });
              } catch {
                toast({
                  title: 'Teilen fehlgeschlagen / Share failed',
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
      mapRef.current = map;
      const canvas = map.getCanvas();
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      const bbox = getMapBbox(map);
      onViewportChange(bbox, map.getZoom());
    });

    map.on('moveend', () => {
      const canvas = map.getCanvas();
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      const bbox = getMapBbox(map);
      const z = map.getZoom();
      onViewportChange(bbox, z);
      setCurrentZoom(z);
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
  const countryMarkers = useMemo(() => areaMarkers.filter((m) => m.type === 'countries'), [areaMarkers]);
  const cityMarkers = useMemo(() => areaMarkers.filter((m) => m.type === 'cities'), [areaMarkers]);
  const villageMarkers = useMemo(() => areaMarkers.filter((m) => m.type === 'neighbourhoods'), [areaMarkers]);

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
      const color = LAYER_COLORS[type as LayerType] ?? '#888';

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
              'interpolate', ['linear'], ['zoom'],
              style.minLabelZoom, 0,
              style.minLabelZoom + 0.5, 1,
            ],
          },
        });

        map.on('mouseenter', circleLayerId, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', circleLayerId, () => { map.getCanvas().style.cursor = ''; });
        map.on('click', circleLayerId, (e: MapLayerMouseEvent) => {
          const feat = e.features?.[0];
          if (!feat || feat.geometry.type !== 'Point') return;
          const props = feat.properties as Record<string, unknown>;
          const meta: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props)) {
            if (k.startsWith('meta_')) {
              try { meta[k.slice(5)] = JSON.parse(v); } catch { meta[k.slice(5)] = v; }
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
  }, [areaMarkers, mapReady, showPopup, countryBoundaries]);

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
      existingSource.setData(filteredGeoJSON);
      return;
    }

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
        'circle-color': ['step', ['get', 'point_count'],
          '#818cf8', 10, '#6366f1', 50, '#4f46e5', 100, '#4338ca', 500, '#3730a3'],
        'circle-opacity': 0.85,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
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
      try { meta = JSON.parse(props.meta ?? '{}'); } catch { /* ignore */ }

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

    map.on('mouseenter', CLUSTERS_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', CLUSTERS_LAYER, () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', UNCLUSTERED_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', UNCLUSTERED_LAYER, () => { map.getCanvas().style.cursor = ''; });

    pointLayersAddedRef.current = true;
  }, [pointsGeoJSON, pointEnabledLayers, mapReady, showPopup]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Box className={className} sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column', height }}>
      <Box ref={containerRef} sx={{ flex: 1, width: '100%', minHeight: 0 }} />

      {/* Lightweight hover tooltip for boundary polygons */}
      <Box
        ref={tooltipRef}
        sx={{
          display: 'none',
          position: 'absolute',
          pointerEvents: 'none',
          zIndex: 20,
          bgcolor: 'background.paper',
          color: 'text.primary',
          px: 1.25,
          py: 0.625,
          fontSize: 13,
          whiteSpace: 'nowrap',
        }}
      />

      {/* Loading overlay */}
      {!mapReady && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'background.default',
            opacity: 0.7,
            zIndex: 5,
          }}
        >
          <CircularProgress size={32} aria-label="Loading" />
        </Box>
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
      <Box
        sx={{
          position: 'absolute',
          top: 12,
          right: 56,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          bgcolor: 'background.paper',
          px: 1,
          py: 0.5,
          transition: 'opacity 200ms',
          opacity: isFetching || pointsTotalCount > 0 ? 1 : 0,
          pointerEvents: 'none',
        }}
      >
        {isFetching && <CircularProgress size={12} aria-label="Loading" />}
        <Typography variant="caption" color="text.secondary">
          {isFetching ? 'Loading...' : `${pointsTotalCount.toLocaleString()} results in view`}
        </Typography>
      </Box>

      {/* "Open full map" link for embedded previews */}
      {linkToFullMap && (
        <Button
          size="small"
          variant="text"
          aria-label="Open full map"
          onClick={() => navigate(linkToFullMap)}
          sx={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            zIndex: 10,
            minWidth: 0,
            px: { xs: 0.75, sm: 1 },
            py: 0.5,
            borderRadius: 0,
            textTransform: 'none',
            fontSize: '0.75rem',
            lineHeight: 1.2,
            color: 'brand.main',
            bgcolor: 'background.paper',
            '&:hover': { bgcolor: 'background.paper', opacity: 0.85 },
          }}
        >
          <ExternalLink size={14} />
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 0.5 }}>
            Full map
          </Box>
        </Button>
      )}

      {/* Filters bar */}
      {showFilters && (
        <ExploreMapFiltersPanel
          filters={filters}
          onFiltersChange={setFilters}
        />
      )}
    </Box>
  );
};

export default ExploreMap;
