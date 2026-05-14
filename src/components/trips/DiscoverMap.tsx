import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MaplibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapStyle } from '@/config/mapStyle';
import type { DiscoverableTrip } from '@/hooks/useDiscoverableTrips';
import { PublicTripCard } from '@/components/trips/PublicTripCard';

interface Props {
  trips: DiscoverableTrip[];
  height?: number | string;
}

interface Geo {
  trip: DiscoverableTrip;
  lat: number;
  lng: number;
}

/**
 * Map view for /trips/discover. Plots each public trip as a circle marker
 * at its primary city's centroid. Click → side panel with the trip card
 * (fork, save, all the same affordances as list view).
 *
 * Trips without geocoded primary cities are silently dropped from the map
 * (caller still shows them in list view).
 */
export function DiscoverMap({ trips, height = 480 }: Props) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const geocoded = useMemo<Geo[]>(
    () =>
      trips
        .filter(
          (t): t is DiscoverableTrip & { primary_city_lat: number; primary_city_lng: number } =>
            typeof t.primary_city_lat === 'number' && typeof t.primary_city_lng === 'number',
        )
        .map((t) => ({ trip: t, lat: t.primary_city_lat, lng: t.primary_city_lng })),
    [trips],
  );

  const selectedTrip = useMemo(
    () => geocoded.find((g) => g.trip.id === selectedId)?.trip ?? null,
    [geocoded, selectedId],
  );

  // Mount map once.
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: mapStyle,
      center: [10, 40],
      zoom: 1.5,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when data changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const styles = getComputedStyle(document.documentElement);
      const fg = `hsl(${styles.getPropertyValue('--foreground').trim() || '0 0% 4%'})`;
      const bg = `hsl(${styles.getPropertyValue('--background').trim() || '0 0% 100%'})`;
      const featureCollection: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: geocoded.map((g) => ({
          type: 'Feature',
          id: g.trip.id,
          geometry: { type: 'Point', coordinates: [g.lng, g.lat] },
          properties: {
            id: g.trip.id,
            title: g.trip.title,
            staff: g.trip.is_staff_pick ? 1 : 0,
          },
        })),
      };
      const existing = map.getSource('discover-trips') as
        | maplibregl.GeoJSONSource
        | undefined;
      if (existing) {
        existing.setData(featureCollection);
      } else {
        map.addSource('discover-trips', { type: 'geojson', data: featureCollection });
        map.addLayer({
          id: 'discover-trips-circle',
          type: 'circle',
          source: 'discover-trips',
          paint: {
            'circle-radius': ['case', ['==', ['get', 'staff'], 1], 9, 7],
            'circle-color': fg,
            'circle-stroke-color': bg,
            'circle-stroke-width': 2,
            'circle-opacity': 0.9,
          },
        });
        map.addLayer({
          id: 'discover-trips-label',
          type: 'symbol',
          source: 'discover-trips',
          minzoom: 4,
          layout: {
            'text-field': ['get', 'title'],
            'text-size': 11,
            'text-offset': [0, 1.2],
            'text-anchor': 'top',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': fg,
            'text-halo-color': bg,
            'text-halo-width': 1.5,
          },
        });
        map.on('click', 'discover-trips-circle', (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (typeof id === 'string') setSelectedId(id);
        });
        map.on('mouseenter', 'discover-trips-circle', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'discover-trips-circle', () => {
          map.getCanvas().style.cursor = '';
        });
      }

      // Fit to markers if any.
      if (geocoded.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        for (const g of geocoded) bounds.extend([g.lng, g.lat]);
        map.fitBounds(bounds, { padding: 60, maxZoom: 6, duration: 0 });
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [geocoded]);

  return (
    <div className="relative" style={{ height }}>
      <div ref={mapContainer} className="absolute inset-0 rounded-lg overflow-hidden border border-border" />
      {selectedTrip && (
        <div className="absolute top-3 right-3 w-[320px] max-w-[calc(100%-24px)] z-10">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Close trip preview"
              className="absolute -top-2 -right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-full bg-foreground text-background shadow"
            >
              ×
            </button>
            <PublicTripCard trip={selectedTrip} />
          </div>
        </div>
      )}
      {geocoded.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-sm text-muted-foreground bg-background/85 backdrop-blur-sm px-4 py-2 rounded-md border border-border">
            No trips with mapped destinations yet.
          </p>
        </div>
      )}
    </div>
  );
}
