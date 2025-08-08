import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSecureMapbox } from '@/hooks/useSecureMapbox';
import { useOptimizedVenues } from '@/hooks/useOptimizedVenues';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
interface FrontPageVenueMapProps {
  className?: string;
}

const DEFAULT_CENTER: [number, number] = [0, 20];

export const FrontPageVenueMap: React.FC<FrontPageVenueMapProps> = ({ className }) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const { token: secureToken, loading: tokenLoading, error: tokenError } = useSecureMapbox();
  const [token, setToken] = useState<string | null>(null);

  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(2.2);
  const [ipLocated, setIpLocated] = useState(false);
  const [mode, setMode] = useState<'all' | 'venues' | 'orgs'>('all');

  // Try secure token, then local storage fallback
  useEffect(() => {
    if (secureToken) {
      setToken(secureToken);
    }
  }, [secureToken]);

  // Fetch approximate user location via IP
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) return;
        const data = await res.json();
        if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          if (!cancelled) {
            setCenter([data.longitude, data.latitude]);
            setZoom(9);
            setIpLocated(true);
          }
        }
      } catch (_) {
        // silent fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch venues; we keep it simple and render all for now
  const { venues = [], isFetching } = (useOptimizedVenues as any)();

  // Initialize map when token ready
  useEffect(() => {
    if (!token || !mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = token;
    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      projection: 'globe',
      center,
      zoom,
      pitch: 45
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

    mapRef.current.on('style.load', () => {
      mapRef.current?.setFog({
        color: 'rgb(255,255,255)',
        'high-color': 'rgb(200,200,225)',
        'horizon-blend': 0.2,
      } as any);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [token]);

  // Update view when IP location arrives
  useEffect(() => {
    if (mapRef.current && ipLocated) {
      mapRef.current.easeTo({ center, zoom, duration: 1200 });
    }
  }, [center, zoom, ipLocated]);

  // Add markers for venues
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const bounds = new mapboxgl.LngLatBounds();
    const allWithCoords = (venues as any[])
      .filter(v => typeof v?.longitude === 'number' && typeof v?.latitude === 'number');

    const filtered = allWithCoords.filter((v) => {
      const isOrg = String(v?.category ?? '').toLowerCase().includes('org');
      if (mode === 'all') return true;
      if (mode === 'orgs') return isOrg;
      return !isOrg;
    });

    filtered.forEach((venue) => {
      const isOrg = String(venue?.category ?? '').toLowerCase().includes('org');
      const el = document.createElement('span');
      el.className = isOrg
        ? 'w-3.5 h-3.5 rounded-full border-2 border-background bg-accent shadow'
        : 'w-3.5 h-3.5 rounded-full border-2 border-background bg-primary shadow';

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([venue.longitude, venue.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(`
          <div style="min-width:200px">
            <strong>${venue.name ?? 'Venue'}</strong><br/>
            <span>${isOrg ? 'Organization' : (venue.category ?? 'Venue')}</span><br/>
            ${venue.city ?? ''}
          </div>
        `))
        .addTo(map);

      markersRef.current.push(marker);
      bounds.extend([venue.longitude, venue.latitude]);
    });

    if (markersRef.current.length > 0) {
      try {
        map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 800 });
      } catch (_) { }
    }
  }, [venues, mode]);


  return (
    <section className={className}>
      <div className="container mx-auto px-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-4">
              <span>Explore Venues & Organizations Near You</span>
              <div className="flex items-center gap-3">
                <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as any)}>
                  <ToggleGroupItem value="all" aria-label="Show all">All</ToggleGroupItem>
                  <ToggleGroupItem value="venues" aria-label="Show venues">Venues</ToggleGroupItem>
                  <ToggleGroupItem value="orgs" aria-label="Show organizations">Orgs</ToggleGroupItem>
                </ToggleGroup>
                {isFetching && <span className="text-sm text-muted-foreground">Loading…</span>}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!token || tokenLoading) ? (
              <div className="h-[480px] w-full rounded-lg bg-muted animate-pulse" aria-label="Loading map" />
            ) : tokenError ? (
              <div className="h-[200px] w-full rounded-lg bg-muted/40 flex items-center justify-center text-sm text-muted-foreground">
                Map unavailable right now. Please try again later.
              </div>
            ) : (
              <div className="relative">
                <div ref={mapContainer} className="h-[480px] w-full rounded-lg" />
                <div className="absolute bottom-3 left-3 text-xs text-muted-foreground bg-background/70 backdrop-blur px-2 py-1 rounded">
                  Centered {ipLocated ? 'via IP location' : 'globally'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default FrontPageVenueMap;
