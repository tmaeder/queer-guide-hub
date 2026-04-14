/**
 * Lightweight map for detail pages (Country, City, Venue, Event, Village).
 * Shows a focused view of a single entity with optional nearby points
 * and boundary polygons. Much simpler than ExploreMap — no layer toggles,
 * no viewport-based fetching, no filters panel.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { mapStyle } from '@/config/mapStyle';
import { LAYER_COLORS, type MapMarker } from '@/hooks/useExploreMapData';
import { renderPopupHTML } from '@/components/map/ExploreMapPopup';
import { useMapBoundaryLayers, type BoundaryLayerConfig } from '@/hooks/useMapBoundaryLayers';

export interface EntityMapMarker {
  id: string;
  lat: number;
  lng: number;
  name: string;
  subtitle?: string;
  color?: string;
  linkTo?: string;
  type?: 'venues' | 'events' | 'cities' | 'countries' | 'restrooms' | 'neighbourhoods';
  meta?: Record<string, unknown>;
  /** Whether this is the primary/focused marker */
  primary?: boolean;
}

export interface EntityMapBoundary {
  geojson: GeoJSON.FeatureCollection;
  config: BoundaryLayerConfig;
  markers: MapMarker[];
}

export interface EntityMapProps {
  /** Center point [lng, lat] */
  center: [number, number];
  /** Initial zoom level */
  zoom?: number;
  /** Height of the map */
  height?: number | string;
  /** Markers to display */
  markers?: EntityMapMarker[];
  /** Optional boundary polygon to render */
  boundary?: EntityMapBoundary;
  /** CSS class name */
  className?: string;
  /** Whether to allow scroll zoom */
  scrollZoom?: boolean;
}

const PRIMARY_MARKER_SOURCE = 'entity-primary';
const NEARBY_SOURCE = 'entity-nearby';
const PRIMARY_LAYER = 'entity-primary-circle';
const PRIMARY_LABEL = 'entity-primary-label';
const NEARBY_LAYER = 'entity-nearby-circle';

export const EntityMap: React.FC<EntityMapProps> = ({
  center,
  zoom = 14,
  height = 300,
  markers = [],
  boundary,
  className,
  scrollZoom = false,
}) => {
  const navigate = useLocalizedNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const primary = markers.filter((m) => m.primary);
  const nearby = markers.filter((m) => !m.primary);

  const showPopup = useCallback(
    (map: maplibregl.Map, lngLat: maplibregl.LngLat, marker: MapMarker) => {
      popupRef.current?.remove();
      const popup = new maplibregl.Popup({ offset: 15, closeButton: true, maxWidth: '240px' })
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

  // Boundary layer
  useMapBoundaryLayers({
    map: mapRef.current,
    mapReady,
    config: boundary?.config ?? { key: '_none', entityType: 'countries', matchKey: '', matchMode: 'code' },
    boundaries: boundary?.geojson,
    markers: boundary?.markers ?? [],
    enabled: !!boundary,
    tooltipEl: tooltipRef.current,
    onPopup: showPopup,
  });

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center,
      zoom,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    if (!scrollZoom) map.scrollZoom.disable();

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

  // Render markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Primary markers (larger, with label)
    if (primary.length > 0) {
      const primaryGeoJSON: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: primary.map((m) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
          properties: {
            name: m.name,
            color: m.color ?? LAYER_COLORS[m.type ?? 'venues'],
          },
        })),
      };

      const existingPrimary = map.getSource(PRIMARY_MARKER_SOURCE) as GeoJSONSource | undefined;
      if (existingPrimary) {
        existingPrimary.setData(primaryGeoJSON);
      } else {
        map.addSource(PRIMARY_MARKER_SOURCE, { type: 'geojson', data: primaryGeoJSON });

        map.addLayer({
          id: PRIMARY_LAYER,
          type: 'circle',
          source: PRIMARY_MARKER_SOURCE,
          paint: {
            'circle-radius': 10,
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95,
          },
        });

        map.addLayer({
          id: PRIMARY_LABEL,
          type: 'symbol',
          source: PRIMARY_MARKER_SOURCE,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 13,
            'text-font': ['Noto Sans Medium'],
            'text-offset': [0, 1.8],
            'text-anchor': 'top',
          },
          paint: {
            'text-color': '#1e293b',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          },
        });
      }
    }

    // Nearby markers (smaller)
    if (nearby.length > 0) {
      const nearbyGeoJSON: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: nearby.map((m) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
          properties: {
            id: m.id,
            name: m.name,
            subtitle: m.subtitle ?? '',
            color: m.color ?? LAYER_COLORS[m.type ?? 'venues'],
            linkTo: m.linkTo ?? '',
            pointType: m.type ?? 'venues',
            meta: JSON.stringify(m.meta ?? {}),
          },
        })),
      };

      const existingNearby = map.getSource(NEARBY_SOURCE) as GeoJSONSource | undefined;
      if (existingNearby) {
        existingNearby.setData(nearbyGeoJSON);
      } else {
        map.addSource(NEARBY_SOURCE, { type: 'geojson', data: nearbyGeoJSON });

        map.addLayer({
          id: NEARBY_LAYER,
          type: 'circle',
          source: NEARBY_SOURCE,
          paint: {
            'circle-radius': 6,
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.8,
          },
        });

        map.on('mouseenter', NEARBY_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', NEARBY_LAYER, () => { map.getCanvas().style.cursor = ''; });
        map.on('click', NEARBY_LAYER, (e) => {
          const feat = e.features?.[0];
          if (!feat || feat.geometry.type !== 'Point') return;
          const props = feat.properties as Record<string, unknown>;
          let meta: Record<string, unknown> = {};
          try { meta = JSON.parse(props.meta ?? '{}'); } catch { /* ignore */ }

          showPopup(map, e.lngLat, {
            id: props.id,
            type: props.pointType,
            lat: (feat.geometry as GeoJSON.Point).coordinates[1],
            lng: (feat.geometry as GeoJSON.Point).coordinates[0],
            name: props.name,
            subtitle: props.subtitle || undefined,
            color: props.color,
            linkTo: props.linkTo || undefined,
            meta,
          });
        });
      }
    }

    // Fit bounds if we have multiple markers
    const allMarkers = [...primary, ...nearby];
    if (allMarkers.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      allMarkers.forEach((m) => bounds.extend([m.lng, m.lat]));
      map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 0 });
    }
  }, [primary, nearby, mapReady, showPopup]);

  return (
    <Box className={className} sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden' }}>
      <Box ref={containerRef} sx={{ height, width: '100%' }} />

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
          <CircularProgress size={24} />
        </Box>
      )}
    </Box>
  );
};

export default EntityMap;
