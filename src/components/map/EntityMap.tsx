/**
 * Lightweight map for detail pages (Country, City, Venue, Event, Village).
 * Shows a focused view of a single entity with optional nearby points
 * and boundary polygons. Much simpler than ExploreMap — no layer toggles,
 * no viewport-based fetching, no filters panel.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Loader2 } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { mapStyle } from '@/config/mapStyle';
import { LAYER_COLORS, type MapMarker } from '@/hooks/useExploreMapData';
import { renderPopupHTML } from '@/components/map/ExploreMapPopup';
import { useMapBoundaryLayers, type BoundaryLayerConfig } from '@/hooks/useMapBoundaryLayers';
import type { VisitedPlaceLookup } from '@/hooks/useVisitedPlaceLookup';
import type { PlaceMarkEntity } from '@/hooks/usePlaceMarks';

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
  /**
   * Optional entity reference used by visitedLookup to check whether the
   * current user has visited this marker. Supply both to opt in.
   */
  entityType?: PlaceMarkEntity;
  entityId?: string;
}

const FOOTPRINT_FILTER_STORAGE_KEY = 'qg.map.footprintFilter';
type FootprintFilter = 'all' | 'only-visited' | 'hide-visited';

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
  /**
   * Optional lookup for "have I visited this?". When provided, matching
   * markers render at reduced opacity and a toggle button lets the user
   * filter "only visited" / "hide visited" (persisted in localStorage).
   */
  visitedLookup?: VisitedPlaceLookup;
}

const PRIMARY_MARKER_SOURCE = 'entity-primary';
const NEARBY_SOURCE = 'entity-nearby';
const PRIMARY_LAYER = 'entity-primary-circle';
const PRIMARY_LABEL = 'entity-primary-label';
const NEARBY_LAYER = 'entity-nearby-circle';

export const EntityMap = ({
  center,
  zoom = 14,
  height = 300,
  markers = [],
  boundary,
  className,
  scrollZoom = false,
  visitedLookup,
}) => {
  const navigate = useLocalizedNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const [footprintFilter, setFootprintFilter] = useState<FootprintFilter>(() => {
    if (typeof window === 'undefined') return 'all';
    const raw = window.localStorage.getItem(FOOTPRINT_FILTER_STORAGE_KEY);
    return raw === 'only-visited' || raw === 'hide-visited' ? raw : 'all';
  });

  const cycleFootprintFilter = useCallback(() => {
    setFootprintFilter((prev) => {
      const next: FootprintFilter =
        prev === 'all' ? 'only-visited' : prev === 'only-visited' ? 'hide-visited' : 'all';
      try {
        window.localStorage.setItem(FOOTPRINT_FILTER_STORAGE_KEY, next);
      } catch {
        /* localStorage may be unavailable */
      }
      return next;
    });
  }, []);

  const isVisitedMarker = useCallback(
    (m: EntityMapMarker) =>
      !!(visitedLookup && m.entityType && m.entityId && visitedLookup.has(m.entityType, m.entityId)),
    [visitedLookup],
  );

  const visibleMarkers = useMemo(() => {
    if (!visitedLookup || footprintFilter === 'all') return markers;
    return markers.filter((m) => {
      const visited = isVisitedMarker(m);
      return footprintFilter === 'only-visited' ? visited : !visited;
    });
  }, [markers, visitedLookup, footprintFilter, isVisitedMarker]);

  const primary = visibleMarkers.filter((m) => m.primary);
  const nearby = visibleMarkers.filter((m) => !m.primary);

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
    map.on('error', () => setMapError(true));

    // Hard timeout: if tiles can't load (blocked by network policy, CDN
    // outage), show a fallback rather than spin forever.
    const timeoutId = window.setTimeout(() => {
      setMapError((prev) => (mapRef.current ? prev : true));
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
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
            visited: isVisitedMarker(m) ? 1 : 0,
          },
        })),
      };

      const existingNearby = map.getSource(NEARBY_SOURCE) as GeoJSONSource | undefined;
      if (existingNearby) {
        existingNearby.setData(nearbyGeoJSON);
        if (map.getLayer(NEARBY_LAYER)) {
          map.setPaintProperty(NEARBY_LAYER, 'circle-opacity', [
            'case',
            ['==', ['get', 'visited'], 1],
            0.3,
            0.8,
          ]);
        }
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
            'circle-opacity': ['case', ['==', ['get', 'visited'], 1], 0.3, 0.8],
          },
        });

        map.on('mouseenter', NEARBY_LAYER, (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const feat = e.features?.[0];
          const tip = tooltipRef.current;
          if (feat && tip && (feat.properties as { visited?: number })?.visited === 1) {
            tip.textContent = '✓ Visited';
            tip.style.display = 'block';
          }
        });
        map.on('mousemove', NEARBY_LAYER, (e) => {
          const tip = tooltipRef.current;
          if (!tip || tip.style.display !== 'block') return;
          tip.style.left = `${e.point.x + 12}px`;
          tip.style.top = `${e.point.y + 12}px`;
        });
        map.on('mouseleave', NEARBY_LAYER, () => {
          map.getCanvas().style.cursor = '';
          if (tooltipRef.current) tooltipRef.current.style.display = 'none';
        });
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
  }, [primary, nearby, mapReady, showPopup, isVisitedMarker]);

  return (
    <div className={className} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
      <div ref={containerRef} style={{ height, width: '100%' }} />

      {visitedLookup && !visitedLookup.isEmpty && (
        <button
          type="button"
          onClick={cycleFootprintFilter}
          className="absolute top-3 left-3 z-[2] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-background border border-border"
          aria-pressed={footprintFilter !== 'all'}
          title="Toggle visited filter"
        >
          {footprintFilter === 'all'
            ? 'Show only places I’ve visited'
            : footprintFilter === 'only-visited'
              ? 'Hide visited'
              : 'Show all'}
        </button>
      )}

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

      {!mapReady && !mapError && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 5 }}
        >
          <Loader2 className="animate-spin" size={24} aria-label="Loading" />
        </div>
      )}

      {mapError && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center"
          style={{ backgroundColor: 'hsl(var(--muted))', zIndex: 5 }}
          role="status"
        >
          <p className="text-sm text-muted-foreground">
            Map couldn&rsquo;t load.
          </p>
          {primary[0] && (
            <a
              href={`https://www.openstreetmap.org/?mlat=${primary[0].lat}&mlon=${primary[0].lng}#map=15/${primary[0].lat}/${primary[0].lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium underline"
            >
              Open in OpenStreetMap
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default EntityMap;
