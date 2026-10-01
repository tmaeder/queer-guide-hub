import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { Button } from '@/components/ui/button';
import { getMapStyle } from '@/config/mapStyle';
import { isWebglSupported } from '@/lib/webglSupport';

interface ReviewLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  fallbackCenter?: { latitude: number; longitude: number } | null;
  onCoordinateChange: (latitude: number, longitude: number) => void;
}

const DEFAULT_CENTER: [number, number] = [8.2275, 46.8182];

function validCoordinates(latitude: number | null, longitude: number | null) {
  return (
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export default function ReviewLocationMap({
  latitude,
  longitude,
  fallbackCenter,
  onCoordinateChange,
}: ReviewLocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onCoordinateChangeRef = useRef(onCoordinateChange);
  const [mapUnavailable, setMapUnavailable] = useState(false);

  useEffect(() => {
    onCoordinateChangeRef.current = onCoordinateChange;
  }, [onCoordinateChange]);

  useEffect(() => {
    if (!containerRef.current || !isWebglSupported()) {
      setMapUnavailable(true);
      return;
    }

    const hasCoordinates = validCoordinates(latitude, longitude);
    const center: [number, number] = hasCoordinates
      ? [longitude as number, latitude as number]
      : fallbackCenter
        ? [fallbackCenter.longitude, fallbackCenter.latitude]
        : DEFAULT_CENTER;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center,
      zoom: hasCoordinates || fallbackCenter ? 13 : 5,
      attributionControl: { compact: true },
      scrollZoom: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('click', (event) => {
      onCoordinateChangeRef.current(event.lngLat.lat, event.lngLat.lng);
    });

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    mapRef.current = map;

    return () => {
      observer.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // The instance owns its initial centre. Later prop changes are synchronised below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!validCoordinates(latitude, longitude)) {
      markerRef.current?.remove();
      markerRef.current = null;
      if (fallbackCenter) {
        map.easeTo({ center: [fallbackCenter.longitude, fallbackCenter.latitude], zoom: 13 });
      }
      return;
    }

    const position: [number, number] = [longitude as number, latitude as number];
    if (!markerRef.current) {
      const marker = new maplibregl.Marker({ draggable: true }).setLngLat(position).addTo(map);
      marker.on('dragend', () => {
        const next = marker.getLngLat();
        onCoordinateChangeRef.current(next.lat, next.lng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat(position);
    }
    map.easeTo({ center: position, zoom: Math.max(map.getZoom(), 13) });
  }, [fallbackCenter, latitude, longitude]);

  if (mapUnavailable) {
    return (
      <div className="flex h-52 items-center justify-center rounded-element border border-border bg-muted/30 px-6 text-center text-xs text-muted-foreground">
        Map preview is unavailable on this device. Coordinates can still be edited precisely below.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div
        ref={containerRef}
        role="region"
        aria-label="Editable proposed location map"
        className="h-52 w-full overflow-hidden rounded-element border border-border bg-muted/30"
      />
      {!validCoordinates(latitude, longitude) && fallbackCenter && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onCoordinateChange(fallbackCenter.latitude, fallbackCenter.longitude)}
        >
          Place marker at selected city
        </Button>
      )}
      <p className="text-2xs text-muted-foreground">
        Click the map to place the marker, or drag the marker to correct the coordinates.
      </p>
    </div>
  );
}
