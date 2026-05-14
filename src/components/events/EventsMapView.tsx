import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Loader2 } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { mapStyle } from '@/config/mapStyle';
import type { Database } from '@/integrations/supabase/types';
import { format } from 'date-fns';

type Event = Database['public']['Tables']['events']['Row'];

interface EventsMapViewProps {
  events: Event[];
  height?: number | string;
  className?: string;
}

const SOURCE_ID = 'events-source';
const CLUSTER_LAYER = 'events-clusters';
const CLUSTER_COUNT_LAYER = 'events-cluster-count';
const UNCLUSTERED_LAYER = 'events-unclustered';

export function EventsMapView({ events, height = 600, className }: EventsMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const navigate = useLocalizedNavigate();

  const geolocated = events.filter((e) => typeof e.latitude === 'number' && typeof e.longitude === 'number');

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [10, 30],
      zoom: 1.5,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      mapRef.current = map;
      setMapReady(true);
      // After mount, the container may have been sized 0 (motion scale, transitions);
      // force a resize so MapLibre picks up the real dimensions.
      requestAnimationFrame(() => map.resize());
      setTimeout(() => map.resize(), 250);
    });
    map.on('error', () => setMapError(true));

    // Observe container size changes (transitions, viewport changes)
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.resize();
    });
    resizeObserver.observe(containerRef.current);

    const timeoutId = window.setTimeout(() => {
      setMapError((prev) => (mapRef.current ? prev : true));
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
      resizeObserver.disconnect();
      popupRef.current?.remove();
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Update markers when events change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.resize();

    const featureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: geolocated.map((e) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [e.longitude as number, e.latitude as number] },
        properties: {
          id: e.id,
          slug: e.slug,
          title: e.title,
          start_date: e.start_date,
          city: e.city ?? '',
          event_type: e.event_type ?? '',
        },
      })),
    };

    const existing = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(featureCollection);
    } else {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: featureCollection,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: CLUSTER_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#0a0a0a',
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 32],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.92,
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 13,
          'text-font': ['Noto Sans Medium'],
        },
        paint: { 'text-color': '#ffffff' },
      });

      map.addLayer({
        id: UNCLUSTERED_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#0a0a0a',
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Click cluster → zoom
      map.on('click', CLUSTER_LAYER, async (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] });
        const feature = features[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const clusterId = feature.properties?.cluster_id;
        const src = map.getSource(SOURCE_ID) as GeoJSONSource;
        try {
          const zoom = await src.getClusterExpansionZoom(clusterId);
          map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
        } catch {
          /* ignore */
        }
      });

      // Hover cursors
      map.on('mouseenter', CLUSTER_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', CLUSTER_LAYER, () => { map.getCanvas().style.cursor = ''; });
      map.on('mouseenter', UNCLUSTERED_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', UNCLUSTERED_LAYER, () => { map.getCanvas().style.cursor = ''; });

      // Click marker → popup
      map.on('click', UNCLUSTERED_LAYER, (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const props = feature.properties as Record<string, string>;
        const coords = feature.geometry.coordinates as [number, number];
        const dateLabel = props.start_date ? format(new Date(props.start_date), 'MMM d, yyyy') : '';
        const html = `
          <div style="font-family: Inter, system-ui, sans-serif; max-width: 220px;">
            <div style="font-weight: 600; font-size: 14px; line-height: 1.3; margin-bottom: 4px;">${escapeHtml(props.title)}</div>
            <div style="font-size: 12px; color: #525252; margin-bottom: 8px;">${escapeHtml(dateLabel)}${props.city ? ' · ' + escapeHtml(props.city) : ''}</div>
            <a href="/events/${escapeHtml(props.slug)}" data-event-link style="font-size: 12px; font-weight: 500; text-decoration: underline; color: #0a0a0a;">View event</a>
          </div>
        `;
        popupRef.current?.remove();
        const popup = new maplibregl.Popup({ offset: 12, closeButton: true, maxWidth: '240px' })
          .setLngLat(coords)
          .setHTML(html)
          .addTo(map);
        popup.on('open', () => {
          const link = popup.getElement()?.querySelector<HTMLAnchorElement>('[data-event-link]');
          link?.addEventListener('click', (ev) => {
            ev.preventDefault();
            const href = link.getAttribute('href');
            if (href) navigate(href);
          });
        });
        popupRef.current = popup;
      });
    }

    // Fit to markers
    if (geolocated.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      geolocated.forEach((e) => bounds.extend([e.longitude as number, e.latitude as number]));
      if (geolocated.length === 1) {
        map.easeTo({ center: bounds.getCenter(), zoom: 11, duration: 400 });
      } else {
        map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 400 });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, mapReady]);

  return (
    <div
      className={className}
      style={{ position: 'relative', borderRadius: 'var(--radius-md, 10px)', overflow: 'hidden' }}
    >
      <div ref={containerRef} style={{ height, width: '100%' }} />

      {!mapReady && !mapError && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'hsl(var(--background) / 0.7)', zIndex: 5 }}
        >
          <Loader2 className="animate-spin" size={24} aria-label="Loading map" />
        </div>
      )}

      {mapError && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center"
          style={{ backgroundColor: 'hsl(var(--muted))', zIndex: 5 }}
          role="status"
        >
          <p className="text-sm text-muted-foreground">Map couldn&rsquo;t load.</p>
        </div>
      )}

      {mapReady && geolocated.length === 0 && (
        <div
          className="absolute inset-0 flex items-center justify-center p-4 text-center pointer-events-none"
          style={{ backgroundColor: 'hsl(var(--background) / 0.85)', zIndex: 4 }}
        >
          <p className="text-sm text-muted-foreground">No events with locations to map.</p>
        </div>
      )}
    </div>
  );
}

function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}
