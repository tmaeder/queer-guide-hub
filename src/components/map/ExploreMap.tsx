import React, { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { mapStyle, globeFog } from '@/config/mapStyle';
import {
  useExploreMapData,
  type LayerType,
  type MapViewport,
  type ExploreMapFilters,
  type MapMarker,
  LAYER_COLORS,
} from '@/hooks/useExploreMapData';
import { ExploreMapLayers, LAYER_DEFS } from '@/components/map/ExploreMapLayers';
import { ExploreMapFiltersPanel } from '@/components/map/ExploreMapFilters';
import { renderPopupHTML } from '@/components/map/ExploreMapPopup';

// ── Layer classification ─────────────────────────────────────────────────────

/** Layers rendered as native MapLibre circle + label layers (area feel) */
export const AREA_LAYERS: LayerType[] = ['cities', 'countries', 'neighbourhoods'];
/** Layers rendered as DOM marker pins */
export const POINT_LAYERS: LayerType[] = ['venues', 'events', 'restrooms', 'hotels'];

/** Circle radius interpolation stops per area type: [zoom, radiusPx][] */
const AREA_RADIUS: Record<string, [number, number][]> = {
  countries:      [[1, 8],  [3, 18], [5, 40], [7, 80],  [9, 150], [12, 280]],
  cities:         [[2, 4],  [4, 8],  [6, 16], [8, 28],  [10, 45], [14, 75]],
  neighbourhoods: [[2, 3],  [4, 6],  [6, 12], [8, 22],  [10, 38], [14, 60]],
};

/** Circle style per area type */
const AREA_STYLE: Record<string, { opacity: number; strokeOpacity: number; minLabelZoom: number }> = {
  countries:      { opacity: 0.2,  strokeOpacity: 0.55, minLabelZoom: 1 },
  cities:         { opacity: 0.25, strokeOpacity: 0.6,  minLabelZoom: 3 },
  neighbourhoods: { opacity: 0.3,  strokeOpacity: 0.7,  minLabelZoom: 6 },
};

// ── Default props ──────────────────────────────────────────────────────────────

const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 2.2;

const IP_GEO_KEY = 'ip_geo';

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
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  /** Track which area sources/layers have been added to the map */
  const areaLayerIdsRef = useRef<Set<string>>(new Set());

  // ── State ────────────────────────────────────────────────────────────────
  const [mapReady, setMapReady] = useState(false);
  const [locating, setLocating] = useState(false);

  const [enabledLayers, setEnabledLayers] = useState<LayerType[]>(
    () => defaultLayers ?? LAYER_DEFS.filter((d) => d.defaultOn && !d.comingSoon).map((d) => d.type),
  );

  const [viewport, setViewport] = useState<MapViewport>({
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
  });

  const [filters, setFilters] = useState<ExploreMapFilters>(defaultFilters ?? {});

  // ── Data hook ────────────────────────────────────────────────────────────
  const { markers, isFetching, layerCounts } = useExploreMapData({
    enabledLayers,
    viewport,
    filters,
  });

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

  // Auto-locate on mount via cached IP geo
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(IP_GEO_KEY);
      if (cached) {
        const { latitude, longitude } = JSON.parse(cached);
        if (typeof latitude === 'number' && typeof longitude === 'number') {
          setViewport({ center: [longitude, latitude], zoom: 10 });
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Fetch IP geo if not cached
  useEffect(() => {
    if (sessionStorage.getItem(IP_GEO_KEY)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          sessionStorage.setItem(IP_GEO_KEY, JSON.stringify({ latitude: data.latitude, longitude: data.longitude }));
          setViewport({ center: [data.longitude, data.latitude], zoom: 10 });
          flyToLocation(data.longitude, data.latitude, 10);
        }
      } catch {
        // silent
      }
    })();
    return () => { cancelled = true; };
  }, [flyToLocation]);

  // Manual "Near Me" via browser geolocation
  const handleLocateMe = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        sessionStorage.setItem(IP_GEO_KEY, JSON.stringify({ latitude, longitude }));
        flyToLocation(longitude, latitude, 13);
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10000, maximumAge: 300000 },
    );
  }, [flyToLocation]);

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

    // Compact attribution (small "i" icon)
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    );

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      'top-right',
    );

    // Disable scroll-zoom on embedded maps to avoid accidental scrolljacking
    if (linkToFullMap) {
      map.scrollZoom.disable();
    }

    map.on('load', () => {
      setMapReady(true);
      mapRef.current = map;
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to initial viewport once map is ready (e.g. from IP geo)
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    mapRef.current.flyTo({ center: viewport.center, zoom: viewport.zoom, speed: 1.2 });
  }, [viewport, mapReady]);

  // ── Helpers: build popup with navigation for area features ──────────────
  const showAreaPopup = useCallback(
    (map: maplibregl.Map, lngLat: maplibregl.LngLat, marker: MapMarker) => {
      // Close any existing area popup
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

  // ── Area layer rendering (native MapLibre circle + label layers) ────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const areaMarkers = markers.filter((m) => AREA_LAYERS.includes(m.type));

    // Group markers by area type
    const grouped: Record<string, MapMarker[]> = {};
    for (const type of AREA_LAYERS) {
      grouped[type] = areaMarkers.filter((m) => m.type === type);
    }

    // Track which sources should exist after this pass
    const activeIds = new Set<string>();
    let layersChanged = false;

    for (const type of AREA_LAYERS) {
      const items = grouped[type] ?? [];
      const sourceId = `area-source-${type}`;
      const circleLayerId = `area-circle-${type}`;
      const labelLayerId = `area-label-${type}`;

      if (items.length === 0) {
        // Remove layers when toggled off
        if (map.getLayer(labelLayerId)) { map.removeLayer(labelLayerId); layersChanged = true; }
        if (map.getLayer(circleLayerId)) { map.removeLayer(circleLayerId); layersChanged = true; }
        if (map.getSource(sourceId)) { map.removeSource(sourceId); layersChanged = true; }
        areaLayerIdsRef.current.delete(sourceId);
        continue;
      }

      activeIds.add(sourceId);

      // Build GeoJSON FeatureCollection
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
              Object.entries(m.meta ?? {}).map(([k, v]) => [`meta_${k}`, typeof v === 'object' ? JSON.stringify(v) : v]),
            ),
          },
        })),
      };

      const style = AREA_STYLE[type] ?? AREA_STYLE.cities;
      const radii = AREA_RADIUS[type] ?? AREA_RADIUS.cities;
      const color = LAYER_COLORS[type as LayerType] ?? '#888';

      // Build zoom-interpolated radius expression
      const radiusExpr: any[] = ['interpolate', ['linear'], ['zoom']];
      for (const [z, r] of radii) radiusExpr.push(z, r);

      // Upsert: update data if source exists, otherwise create source + layers
      const existingSource = map.getSource(sourceId) as GeoJSONSource | undefined;
      if (existingSource) {
        existingSource.setData(geojson);
      } else {
        map.addSource(sourceId, { type: 'geojson', data: geojson });

        // Circle fill layer
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

        // Text label layer
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
            'text-opacity': ['interpolate', ['linear'], ['zoom'], style.minLabelZoom, 0, style.minLabelZoom + 0.5, 1],
          },
        });

        // Interactivity: cursor + click popup
        map.on('mouseenter', circleLayerId, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', circleLayerId, () => { map.getCanvas().style.cursor = ''; });
        map.on('click', circleLayerId, (e: MapLayerMouseEvent) => {
          const feat = e.features?.[0];
          if (!feat || feat.geometry.type !== 'Point') return;
          const props = feat.properties as Record<string, any>;
          const meta: Record<string, any> = {};
          for (const [k, v] of Object.entries(props)) {
            if (k.startsWith('meta_')) {
              try { meta[k.slice(5)] = JSON.parse(v); } catch { meta[k.slice(5)] = v; }
            }
          }
          showAreaPopup(map, e.lngLat, {
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

    // Remove stale area layers no longer needed
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

    // Force MapLibre to repaint when layers were added/removed
    if (layersChanged) {
      map.triggerRepaint();
    }
  }, [markers, mapReady, showAreaPopup]);

  // ── Point marker rendering (DOM markers for venues, events, etc.) ───────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Clear existing DOM markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Only point-type markers get DOM pins
    const pointMarkers = markers.filter((m) => !AREA_LAYERS.includes(m.type));

    const bounds = new maplibregl.LngLatBounds();
    // Include area markers in bounds calculation too
    markers.forEach((m) => bounds.extend([m.lng, m.lat]));

    if (pointMarkers.length === 0 && markers.length === 0) return;

    pointMarkers.forEach((marker) => {
      const el = document.createElement('div');
      el.style.width = `${(marker.scale ?? 1) * 24}px`;
      el.style.height = `${(marker.scale ?? 1) * 24}px`;
      el.style.borderRadius = '50%';
      el.style.background = marker.color;
      el.style.border = '2px solid #fff';
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';

      const popup = new maplibregl.Popup({ offset: 15, closeButton: true, maxWidth: '260px' })
        .setHTML(renderPopupHTML(marker));

      // Navigate on popup link click
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

      const m = new maplibregl.Marker({ element: el })
        .setLngLat([marker.lng, marker.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(m);
    });

    // Only fit bounds if there are many markers (avoid zoom-to-single-point)
    if (markers.length > 1) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    }
  }, [markers, mapReady, navigate]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Box className={className} sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden' }}>
      {/* Map canvas — always in the DOM */}
      <Box ref={containerRef} sx={{ height, width: '100%' }} />

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

      {/* Fetching indicator */}
      {isFetching && (
        <Box
          sx={{
            position: 'absolute',
            top: 12,
            right: 56,
            zIndex: 10,
            bgcolor: 'rgba(255,255,255,0.9)',
            borderRadius: 1,
            px: 1,
            py: 0.5,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <CircularProgress size={12} />
          <Typography variant="caption" color="text.secondary">Loading…</Typography>
        </Box>
      )}

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

      {/* Filters bar below map */}
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
