import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapStyle } from '@/config/mapStyle';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import type { Hotel } from '@/hooks/useHotels';

interface HotelsMapProps {
  hotels: Hotel[];
  height?: number | string;
}

const SOURCE_ID = 'hotels-source';
const CLUSTER_LAYER = 'hotels-clusters';
const CLUSTER_COUNT_LAYER = 'hotels-cluster-count';
const POINT_LAYER = 'hotels-point';

export function HotelsMap({ hotels, height = 560 }: HotelsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const navigate = useLocalizedNavigate();
  const [ready, setReady] = useState(false);

  // Init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [10, 20],
      zoom: 1.5,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      mapRef.current = map;
      setReady(true);
    });

    return () => {
      popupRef.current?.remove();
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Build/update source + layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const features: GeoJSON.Feature[] = hotels
      .filter(
        (h) =>
          typeof h.latitude === 'number' &&
          typeof h.longitude === 'number' &&
          !Number.isNaN(h.latitude) &&
          !Number.isNaN(h.longitude),
      )
      .map((h) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [h.longitude as number, h.latitude as number],
        },
        properties: {
          id: h.id,
          name: h.name,
          slug: h.slug ?? '',
          city: h.city ?? '',
          country: h.country ?? '',
        },
      }));

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features,
    };

    const existing = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (existing) {
      existing.setData(geojson);
    } else {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 12,
      });

      map.addLayer({
        id: CLUSTER_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#0a0a0a',
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      });

      map.addLayer({
        id: POINT_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#0a0a0a',
          'circle-radius': 6,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
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
        const { name, slug, city, country } = feature.properties as {
          name?: string;
          slug?: string;
          city?: string;
          country?: string;
        };
        const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
        popupRef.current?.remove();
        const html = `<div style="font-family:inherit"><strong>${name ?? ''}</strong><br/><span style="color:#666">${[city, country].filter(Boolean).join(', ')}</span><br/><a href="/hotels/${slug ?? ''}" data-href="/hotels/${slug ?? ''}" style="display:inline-block;margin-top:6px;text-decoration:underline">View hotel</a></div>`;
        const popup = new maplibregl.Popup({ offset: 12, closeButton: true })
          .setLngLat([lng, lat])
          .setHTML(html)
          .addTo(map);
        popup.on('open', () => {
          const link = popup.getElement()?.querySelector('a[data-href]');
          link?.addEventListener('click', (ev) => {
            ev.preventDefault();
            const href = (ev.currentTarget as HTMLAnchorElement).getAttribute('data-href');
            if (href) navigate(href);
          });
        });
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

    // Fit to data
    if (features.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      features.forEach((f) => {
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
        bounds.extend([lng, lat]);
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 50, maxZoom: 11, duration: 600 });
      }
    }
  }, [hotels, ready, navigate]);

  return (
    <div
      ref={containerRef}
      className="w-full border border-foreground/10"
      style={{ height }}
    />
  );
}
