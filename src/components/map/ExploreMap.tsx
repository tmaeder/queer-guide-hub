import React, { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router';
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
import { CLUSTER_MAX_ZOOM, CLUSTER_RADIUS, type Bbox } from '@/utils/mapViewport';
import { useCountryBoundaries } from '@/hooks/useBoundaryData';
import { enrichBoundaryFeatures } from '@/utils/boundaryUtils';

// ── Layer classification ─────────────────────────────────────────────────────

/** Layers rendered as native MapLibre circle + label layers (area feel) */
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

// ── Boundary polygon layer IDs ───────────────────────────────────────────────

const BOUNDARY_SOURCE = 'boundary-countries';
const BOUNDARY_FILL = 'boundary-countries-fill';
const BOUNDARY_STROKE = 'boundary-countries-stroke';
const BOUNDARY_LABEL = 'boundary-countries-label';

// ── MapLibre layer IDs for point data ────────────────────────────────────────

const POINTS_SOURCE = 'points-source';
const CLUSTERS_LAYER = 'clusters';
const CLUSTER_COUNT_LAYER = 'cluster-count';
const UNCLUSTERED_LAYER = 'unclustered-point';

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
}) => {
  const navigate = useNavigate();

  // ── Map refs ─────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const areaLayerIdsRef = useRef<Set<string>>(new Set());
  const boundaryLayerAddedRef = useRef(false);
  const hoveredBoundaryIdRef = useRef<number | null>(null);
  const pointLayersAddedRef = useRef(false);

  // ── State ────────────────────────────────────────────────────────────────
  const [mapReady, setMapReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);

  const [enabledLayers, setEnabledLayers] = useState<LayerType[]>(
    () =>
      defaultLayers ?? LAYER_DEFS.filter((d) => d.defaultOn && !d.comingSoon).map((d) => d.type),
  );

  const [viewport, setViewport] = useState<MapViewport>({
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
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

  // ── Data: country boundary polygons ─────────────────────────────────────
  const countriesEnabled = enabledLayers.includes('countries');
  const { data: countryBoundaries } = useCountryBoundaries(countriesEnabled, currentZoom);

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
    if (visitorGeo) {
      setViewport({ center: [visitorGeo.longitude, visitorGeo.latitude], zoom: 10 });
      flyToLocation(visitorGeo.longitude, visitorGeo.latitude, 10);
    }
  }, [visitorGeo, flyToLocation]);

  const handleLocateMe = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        sessionStorage.setItem('ip_geo', JSON.stringify({ latitude, longitude }));
        flyToLocation(longitude, latitude, 13);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10000, maximumAge: 300000 },
    );
  }, [flyToLocation]);

  // ── Helper: extract bbox from map ────────────────────────────────────────
  const getMapBbox = useCallback((map: maplibregl.Map): Bbox => {
    const bounds = map.getBounds();
    return {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    };
  }, []);

  // ── Helper: show popup with navigation ───────────────────────────────────
  const showPopup = useCallback(
    (map: maplibregl.Map, lngLat: maplibregl.LngLat, marker: MapMarker) => {
      popupRef.current?.remove();
      const popup = new maplibregl.Popup({ offset: 15, closeButton: true, maxWidth: '260px' })
        .setLngLat(lngLat)
        .setHTML(renderPopupHTML(marker))
        .addTo(map);

      popup.on('open', () => {
        const link = popup.getElement()?.querySelector('a[href^="/"]');
        if (link) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = (e.currentTarget as HTMLAnchorElement).getAttribute('href');
            if (href) navigate(href);
          });
        }
      });

      popupRef.current = popup;
    },
    [navigate],
  );

  // ── Map initialisation ───────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: viewport.center,
      zoom: viewport.zoom,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    if (linkToFullMap) map.scrollZoom.disable();

    map.on('load', () => {
      setMapReady(true);
      mapRef.current = map;

      // Fire initial viewport fetch
      const bbox = getMapBbox(map);
      onViewportChange(bbox, map.getZoom());
    });

    // Track viewport on move/zoom for point data fetching + boundary resolution
    map.on('moveend', () => {
      const bbox = getMapBbox(map);
      const z = map.getZoom();
      onViewportChange(bbox, z);
      setCurrentZoom(z);
    });

    return () => {
      mapRef.current = null;
      pointLayersAddedRef.current = false;
      boundaryLayerAddedRef.current = false;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to initial viewport once map is ready (e.g. from IP geo)
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    mapRef.current.flyTo({ center: viewport.center, zoom: viewport.zoom, speed: 1.2 });
  }, [viewport, mapReady]);

  // ── Area layer rendering (circles + labels, skips countries when polygons available) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // When boundary polygons are loaded, skip circle rendering for countries
    const skipCircleTypes = countryBoundaries ? ['countries'] : [];
    const activeAreaLayers = AREA_LAYERS.filter((t) => !skipCircleTypes.includes(t));

    const onlyArea = areaMarkers.filter((m) => activeAreaLayers.includes(m.type));
    const grouped: Record<string, MapMarker[]> = {};
    for (const type of AREA_LAYERS) grouped[type] = onlyArea.filter((m) => m.type === type);

    const activeIds = new Set<string>();
    let layersChanged = false;

    for (const type of AREA_LAYERS) {
      const items = grouped[type] ?? [];
      const sourceId = `area-source-${type}`;
      const circleLayerId = `area-circle-${type}`;
      const labelLayerId = `area-label-${type}`;

      if (items.length === 0) {
        if (map.getLayer(labelLayerId)) {
          map.removeLayer(labelLayerId);
          layersChanged = true;
        }
        if (map.getLayer(circleLayerId)) {
          map.removeLayer(circleLayerId);
          layersChanged = true;
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
          layersChanged = true;
        }
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

      const radiusExpr: any[] = ['interpolate', ['linear'], ['zoom']];
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
            'circle-radius': radiusExpr as any,
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
          const props = feat.properties as Record<string, any>;
          const meta: Record<string, any> = {};
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
        layersChanged = true;
      }
    }

    for (const oldId of [...areaLayerIdsRef.current]) {
      if (!activeIds.has(oldId)) {
        const t = oldId.replace('area-source-', '');
        if (map.getLayer(`area-label-${t}`)) map.removeLayer(`area-label-${t}`);
        if (map.getLayer(`area-circle-${t}`)) map.removeLayer(`area-circle-${t}`);
        if (map.getSource(oldId)) map.removeSource(oldId);
        areaLayerIdsRef.current.delete(oldId);
        layersChanged = true;
      }
    }

    if (layersChanged) map.triggerRepaint();
  }, [areaMarkers, mapReady, showPopup, countryBoundaries]);

  // ── Country boundary polygon rendering ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // If no boundary data or countries layer disabled, remove layers if present
    if (!countryBoundaries || !countriesEnabled) {
      if (map.getLayer(BOUNDARY_LABEL)) map.removeLayer(BOUNDARY_LABEL);
      if (map.getLayer(BOUNDARY_STROKE)) map.removeLayer(BOUNDARY_STROKE);
      if (map.getLayer(BOUNDARY_FILL)) map.removeLayer(BOUNDARY_FILL);
      if (map.getSource(BOUNDARY_SOURCE)) map.removeSource(BOUNDARY_SOURCE);
      boundaryLayerAddedRef.current = false;
      return;
    }

    // Enrich boundary features with entity data from markers
    const countryMarkers = areaMarkers.filter((m) => m.type === 'countries');
    const enriched = enrichBoundaryFeatures(countryBoundaries, countryMarkers);

    if (enriched.features.length === 0) return;

    const color = LAYER_COLORS.countries ?? '#dc2626';

    // Update existing source or create from scratch
    const existingSource = map.getSource(BOUNDARY_SOURCE) as GeoJSONSource | undefined;
    if (existingSource) {
      existingSource.setData(enriched);
      return;
    }

    // Add source with promoteId for feature-state
    map.addSource(BOUNDARY_SOURCE, {
      type: 'geojson',
      data: enriched,
      promoteId: 'entityId',
    });

    // Fill layer — opacity driven by feature-state for hover/select
    map.addLayer({
      id: BOUNDARY_FILL,
      type: 'fill',
      source: BOUNDARY_SOURCE,
      paint: {
        'fill-color': color,
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          0.35,
          ['boolean', ['feature-state', 'hovered'], false],
          0.22,
          0.1,
        ],
        'fill-opacity-transition': { duration: 250 },
      },
    });

    // Stroke layer
    map.addLayer({
      id: BOUNDARY_STROKE,
      type: 'line',
      source: BOUNDARY_SOURCE,
      paint: {
        'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#1e293b', color],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          2.5,
          ['boolean', ['feature-state', 'hovered'], false],
          1.8,
          0.8,
        ],
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          0.8,
          ['boolean', ['feature-state', 'hovered'], false],
          0.7,
          0.5,
        ],
        'line-width-transition': { duration: 200 },
      },
    });

    // Label layer
    map.addLayer({
      id: BOUNDARY_LABEL,
      type: 'symbol',
      source: BOUNDARY_SOURCE,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 5, 12, 8, 14],
        'text-font': ['Noto Sans Medium'],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-anchor': 'center',
      },
      paint: {
        'text-color': '#1e293b',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    });

    // ── Hover interactivity via feature-state ─────────────────────────
    map.on('mousemove', BOUNDARY_FILL, (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      map.getCanvas().style.cursor = 'pointer';

      const id = feat.properties?.entityId as string | undefined;
      const numId = feat.id as number | undefined;

      // Clear previous hover
      if (hoveredBoundaryIdRef.current !== null && hoveredBoundaryIdRef.current !== numId) {
        map.setFeatureState(
          { source: BOUNDARY_SOURCE, id: hoveredBoundaryIdRef.current },
          { hovered: false },
        );
      }

      if (numId != null) {
        map.setFeatureState({ source: BOUNDARY_SOURCE, id: numId }, { hovered: true });
        hoveredBoundaryIdRef.current = numId;
      }

      // Update tooltip using safe DOM methods
      const tip = tooltipRef.current;
      if (tip && id) {
        const props = feat.properties as Record<string, string>;
        // Clear previous content
        while (tip.firstChild) tip.removeChild(tip.firstChild);
        // Name
        const nameEl = document.createElement('strong');
        nameEl.textContent = props.name ?? '';
        tip.appendChild(nameEl);
        // Precision badge
        const precision = props.precision ?? 'approximate';
        const badge = document.createElement('span');
        badge.textContent = precision.charAt(0).toUpperCase() + precision.slice(1);
        badge.style.cssText =
          'margin-left:6px;font-size:10px;padding:1px 5px;border-radius:3px;' +
          'background:#e2e8f0;color:#475569;font-weight:500;';
        tip.appendChild(badge);
        // Position
        tip.style.left = `${e.point.x + 12}px`;
        tip.style.top = `${e.point.y - 12}px`;
        tip.style.display = 'block';
      }
    });

    map.on('mouseleave', BOUNDARY_FILL, () => {
      map.getCanvas().style.cursor = '';
      if (hoveredBoundaryIdRef.current !== null) {
        map.setFeatureState(
          { source: BOUNDARY_SOURCE, id: hoveredBoundaryIdRef.current },
          { hovered: false },
        );
        hoveredBoundaryIdRef.current = null;
      }
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    });

    // Click → show popup + navigate
    map.on('click', BOUNDARY_FILL, (e: MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const props = feat.properties as Record<string, string>;
      const meta: Record<string, any> = {};
      for (const [k, v] of Object.entries(props)) {
        if (k.startsWith('meta_')) {
          try {
            meta[k.slice(5)] = JSON.parse(v);
          } catch {
            meta[k.slice(5)] = v;
          }
        }
      }
      // Find centroid for popup from the matching marker
      const marker = areaMarkers.find((m) => m.id === props.entityId);
      const lngLat = marker ? new maplibregl.LngLat(marker.lng, marker.lat) : e.lngLat;

      showPopup(map, lngLat, {
        id: props.entityId,
        type: 'countries' as LayerType,
        lat: lngLat.lat,
        lng: lngLat.lng,
        name: props.name,
        subtitle: props.subtitle || undefined,
        color: props.color,
        linkTo: props.linkTo || undefined,
        meta,
      });
    });

    boundaryLayerAddedRef.current = true;
  }, [countryBoundaries, countriesEnabled, areaMarkers, mapReady, showPopup]);

  // ── Point layers: native MapLibre source with built-in clustering ──────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // If no point layers are enabled, clean up and hide
    if (pointEnabledLayers.length === 0) {
      if (map.getLayer(CLUSTER_COUNT_LAYER)) map.removeLayer(CLUSTER_COUNT_LAYER);
      if (map.getLayer(CLUSTERS_LAYER)) map.removeLayer(CLUSTERS_LAYER);
      if (map.getLayer(UNCLUSTERED_LAYER)) map.removeLayer(UNCLUSTERED_LAYER);
      if (map.getSource(POINTS_SOURCE)) map.removeSource(POINTS_SOURCE);
      pointLayersAddedRef.current = false;
      return;
    }

    // Filter GeoJSON to only include enabled point types
    const filteredGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: pointsGeoJSON.features.filter((f) =>
        pointEnabledLayers.includes(f.properties.pointType),
      ),
    };

    const existingSource = map.getSource(POINTS_SOURCE) as GeoJSONSource | undefined;
    if (existingSource) {
      // Update data — layers stay, no flicker
      existingSource.setData(filteredGeoJSON);
      return;
    }

    // First time: add source + layers
    map.addSource(POINTS_SOURCE, {
      type: 'geojson',
      data: filteredGeoJSON,
      cluster: true,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterRadius: CLUSTER_RADIUS,
      clusterProperties: {
        // Aggregate counts per type inside clusters
        venue_count: ['+', ['case', ['==', ['get', 'pointType'], 'venues'], 1, 0]],
        event_count: ['+', ['case', ['==', ['get', 'pointType'], 'events'], 1, 0]],
        restroom_count: ['+', ['case', ['==', ['get', 'pointType'], 'restrooms'], 1, 0]],
      },
    });

    // ── Cluster circles ───────────────────────────────────────────────────
    map.addLayer({
      id: CLUSTERS_LAYER,
      type: 'circle',
      source: POINTS_SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        // Size scales with point count
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          16, // < 10 points
          10,
          20, // 10-49
          50,
          26, // 50-99
          100,
          32, // 100-499
          500,
          40, // 500+
        ],
        // Color darkens with density
        'circle-color': [
          'step',
          ['get', 'point_count'],
          '#818cf8', // light indigo (few)
          10,
          '#6366f1', // indigo
          50,
          '#4f46e5', // darker
          100,
          '#4338ca', // deep indigo
          500,
          '#3730a3', // very deep
        ],
        'circle-opacity': 0.85,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });

    // ── Cluster count labels ──────────────────────────────────────────────
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
      paint: {
        'text-color': '#ffffff',
      },
    });

    // ── Unclustered individual points ─────────────────────────────────────
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

    // ── Interactivity ─────────────────────────────────────────────────────

    // Cluster click → zoom into cluster
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
        // Fallback: zoom in by 2 levels
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
      const props = feat.properties as Record<string, any>;
      let meta: Record<string, any> = {};
      try {
        meta = JSON.parse(props.meta ?? '{}');
      } catch {
        /* ignore malformed JSON */
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

    // Cursor changes
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
    });

    pointLayersAddedRef.current = true;
  }, [pointsGeoJSON, pointEnabledLayers, mapReady, showPopup]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Box className={className} sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden' }}>
      <Box ref={containerRef} sx={{ height, width: '100%' }} />

      {/* Lightweight hover tooltip for boundary polygons */}
      <div
        ref={tooltipRef}
        style={{
          display: 'none',
          position: 'absolute',
          pointerEvents: 'none',
          zIndex: 20,
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 6,
          padding: '5px 10px',
          fontSize: 13,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
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
            bgcolor: 'rgba(255,255,255,0.7)',
            zIndex: 5,
          }}
        >
          <CircularProgress size={32} />
        </Box>
      )}

      {/* Layer toggles */}
      {showLayerToggles && (
        <ExploreMapLayers
          enabledLayers={enabledLayers}
          onToggle={toggleLayer}
          layerCounts={layerCounts}
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
          bgcolor: 'rgba(255,255,255,0.9)',
          borderRadius: 1,
          px: 1,
          py: 0.5,
          transition: 'opacity 200ms',
          opacity: isFetching || pointsTotalCount > 0 ? 1 : 0,
          pointerEvents: 'none',
        }}
      >
        {isFetching && <CircularProgress size={12} />}
        <Typography variant="caption" color="text.secondary">
          {isFetching ? 'Loading…' : `${pointsTotalCount.toLocaleString()} results in view`}
        </Typography>
      </Box>

      {/* "Open full map" link for embedded previews */}
      {linkToFullMap && (
        <Button
          size="small"
          variant="contained"
          startIcon={<ExternalLink size={14} />}
          onClick={() => navigate(linkToFullMap)}
          sx={{
            position: 'absolute',
            bottom: 36,
            right: 12,
            zIndex: 10,
            textTransform: 'none',
            fontSize: '0.8rem',
            bgcolor: 'rgba(99,102,241,0.9)',
            '&:hover': { bgcolor: 'rgba(99,102,241,1)' },
          }}
        >
          Open Full Map
        </Button>
      )}

      {/* Filters bar */}
      {showFilters && (
        <Box sx={{ mt: 1 }}>
          <ExploreMapFiltersPanel
            filters={filters}
            onFiltersChange={setFilters}
            onLocateMe={handleLocateMe}
            locating={locating}
          />
        </Box>
      )}
    </Box>
  );
};

export default ExploreMap;
