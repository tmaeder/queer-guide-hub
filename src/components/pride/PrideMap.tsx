import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapStyle } from '@/config/mapStyle';
import { useTheme } from '@/components/theme/ThemeProvider';
import { isWebglSupported } from '@/lib/webglSupport';
import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';

interface PrideMapProps {
  events: PrideCalendarEvent[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  height?: number | string;
}

const SOURCE_ID = 'prides-source';
const CLUSTER_LAYER = 'prides-clusters';
const CLUSTER_COUNT_LAYER = 'prides-cluster-count';
const POINT_LAYER = 'prides-point';
const POINT_SELECTED_LAYER = 'prides-point-selected';

export function PrideMap({ events, selectedId, onSelect, height = 480 }: PrideMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [ready, setReady] = useState(false);
  const { resolvedTheme } = useTheme();

  // Recreated when the theme flips so the basemap flavor follows it.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!isWebglSupported()) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(resolvedTheme),
      center: [10, 20],
      zoom: 1.2,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      mapRef.current = map;
      setReady(true);
      requestAnimationFrame(() => map.resize());
    });
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      popupRef.current?.remove();
      mapRef.current = null;
      setReady(false);
      map.remove();
    };
  }, [resolvedTheme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const features: GeoJSON.Feature[] = events
      .filter((e) => typeof e.latitude === 'number' && typeof e.longitude === 'number')
      .map((e) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.longitude as number, e.latitude as number] },
        properties: {
          id: e.id,
          title: e.title,
          slug: e.slug,
          city: e.city ?? '',
          country: e.country ?? '',
          is_featured: e.is_featured ? 1 : 0,
          start: e.start_date,
        },
      }));

    const geojson: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };
    const existing = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(geojson);
    } else {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterRadius: 45,
        clusterMaxZoom: 10,
      });
      map.addLayer({
        id: CLUSTER_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#0a0a0a',
          'circle-radius': ['step', ['get', 'point_count'], 14, 5, 18, 15, 24, 50, 32],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: POINT_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['case', ['==', ['get', 'is_featured'], 1], '#0a0a0a', '#ffffff'],
          'circle-radius': ['case', ['==', ['get', 'is_featured'], 1], 7, 5],
          'circle-stroke-color': '#0a0a0a',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: POINT_SELECTED_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['==', ['get', 'id'], selectedId ?? ''],
        paint: {
          'circle-color': '#0a0a0a',
          'circle-radius': 10,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      });

      map.on('click', CLUSTER_LAYER, (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const clusterId = feature.properties?.cluster_id;
        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
          map.easeTo({ center: [lng, lat], zoom: zoom ?? map.getZoom() + 2 });
        });
      });

      map.on('click', POINT_LAYER, (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const { id, title, slug, city, country, start } = feature.properties as {
          id?: string;
          title?: string;
          slug?: string;
          city?: string;
          country?: string;
          start?: string;
        };
        if (id && onSelect) onSelect(id);
        const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
        popupRef.current?.remove();
        const date = start ? new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        const html = `<div style="font-family:inherit;min-width:180px"><strong>${title ?? ''}</strong><br/><span style="color:#666">${[city, country].filter(Boolean).join(', ')}${date ? ' · ' + date : ''}</span><br/><a href="/events/${slug ?? ''}" style="display:inline-block;margin-top:6px;text-decoration:underline">View pride</a></div>`;
        const popup = new maplibregl.Popup({ offset: 12, closeButton: true })
          .setLngLat([lng, lat])
          .setHTML(html)
          .addTo(map);
        popupRef.current = popup;
      });

      const setCursor = (cursor: string) => () => {
        map.getCanvas().style.cursor = cursor;
      };
      map.on('mouseenter', CLUSTER_LAYER, setCursor('pointer'));
      map.on('mouseleave', CLUSTER_LAYER, setCursor(''));
      map.on('mouseenter', POINT_LAYER, setCursor('pointer'));
      map.on('mouseleave', POINT_LAYER, setCursor(''));
    }
  }, [events, ready, onSelect, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer(POINT_SELECTED_LAYER)) {
      map.setFilter(POINT_SELECTED_LAYER, ['==', ['get', 'id'], selectedId ?? '']);
    }
    if (selectedId) {
      const ev = events.find((e) => e.id === selectedId);
      if (ev && typeof ev.latitude === 'number' && typeof ev.longitude === 'number') {
        map.easeTo({ center: [ev.longitude, ev.latitude], zoom: Math.max(map.getZoom(), 4), duration: 600 });
      }
    }
  }, [selectedId, ready, events]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-container border border-foreground/10 overflow-hidden"
      style={{ height }}
      role="region"
      aria-label={t('pride.map.aria')}
    />
  );
}
