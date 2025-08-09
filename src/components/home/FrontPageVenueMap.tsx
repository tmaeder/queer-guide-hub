import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { useOptimizedVenues } from '@/hooks/useOptimizedVenues';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { VenueFilters } from '@/components/venues/VenueFilters';
import { useSecureMapbox } from '@/hooks/useSecureMapbox';
interface FrontPageVenueMapProps {
  className?: string;
  fullWidth?: boolean;
  heightClass?: string;
}

// Google Maps configuration
const DEFAULT_CENTER: [number, number] = [0, 20];

export const FrontPageVenueMap: React.FC<FrontPageVenueMapProps> = ({ className, fullWidth, heightClass }) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoading, setMapLoading] = useState(true);

  const { token, loading: tokenLoading, error: tokenError } = useSecureMapbox();

  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(2.2);
  const [ipLocated, setIpLocated] = useState(false);
  const [mode, setMode] = useState<'all' | 'venues' | 'orgs'>('all');
  const [filters, setFilters] = useState<any>({ limit: 200 });


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

  // Fetch venues with current filters
  const { venues = [], isFetching } = (useOptimizedVenues as any)(filters);

  // Initialize Mapbox map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !token) return;
    setMapLoading(true);

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [center[0], center[1]],
      zoom: zoom,
      projection: 'globe',
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.scrollZoom.disable();

    map.on('load', () => {
      setMapLoading(false);
      mapRef.current = map;
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, [token]);

  // Update view when IP location arrives
  useEffect(() => {
    if (mapRef.current && ipLocated) {
      (mapRef.current as mapboxgl.Map).easeTo({ center: [center[0], center[1]], zoom });
    }
  }, [center, zoom, ipLocated]);

  // Apply "near me" filtering once IP location is known
  useEffect(() => {
    if (ipLocated) {
      setFilters((prev: any) => ({
        ...prev,
        nearMe: true,
        userLocation: { latitude: center[1], longitude: center[0] },
      }));
    }
  }, [ipLocated, center]);

  // Recenter map when userLocation filter is applied
  useEffect(() => {
    const map = mapRef.current as mapboxgl.Map | null;
    const ul = (filters as any)?.userLocation;
    if (!map || !ul) return;
    if ((filters as any)?.nearMe) {
      map.easeTo({ center: [ul.longitude, ul.latitude], zoom: 12 });
    }
  }, [filters?.userLocation, filters?.nearMe]);

  // Add markers for venues
  useEffect(() => {
    const map = mapRef.current as mapboxgl.Map | null;
    if (!map || !token) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const allWithCoords = (venues as any[])
      .filter(v => typeof v?.longitude === 'number' && typeof v?.latitude === 'number');

    const filtered = allWithCoords.filter((v) => {
      const isOrg = String(v?.category ?? '').toLowerCase().includes('org');
      if (mode === 'all') return true;
      if (mode === 'orgs') return isOrg;
      return !isOrg;
    });

    const bounds = new mapboxgl.LngLatBounds();

    filtered.forEach((venue) => {
      const isOrg = String(venue?.category ?? '').toLowerCase().includes('org');

      const marker = new mapboxgl.Marker({
        color: isOrg ? '#0ea5e9' : '#6366f1'
      })
        .setLngLat([venue.longitude, venue.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <div class="p-2 min-w-[200px]">
              <strong>${venue.name ?? 'Venue'}</strong><br/>
              <span class="text-xs text-muted-foreground">${isOrg ? 'Organization' : (venue.category ?? 'Venue')}</span><br/>
              <span class="text-xs">${venue.city ?? ''}</span>
            </div>
          `)
        )
        .addTo(map);

      markersRef.current.push(marker);
      bounds.extend([venue.longitude, venue.latitude]);
    });

    if (markersRef.current.length > 0) {
      map.fitBounds(bounds, { padding: 60 });
    }
  }, [venues, mode, token]);


  return (
    <section className={className}>
      {fullWidth ? (<>
          <div className="w-full">
          {(mapLoading || tokenLoading) ? (
            <div className={`${heightClass ?? 'h-[480px]'} w-full bg-muted animate-pulse`} aria-label="Loading map" />
          ) : (
            <div className="relative">
              <div ref={mapContainer} className={`${heightClass ?? 'h-[480px]'} w-full`} />
                <div className="absolute bottom-3 left-3 text-xs text-muted-foreground bg-background/70 backdrop-blur px-2 py-1 rounded">
                  Centered {ipLocated ? 'via IP location' : 'globally'}
                  {tokenError && <span className="ml-2 text-destructive">Error loading map</span>}
                </div>
            </div>
          )}
          <div className="w-full">
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as any)}>
                <ToggleGroupItem value="all" aria-label="Show all">All</ToggleGroupItem>
                <ToggleGroupItem value="venues" aria-label="Show venues">Venues</ToggleGroupItem>
                <ToggleGroupItem value="orgs" aria-label="Show organizations">Orgs</ToggleGroupItem>
              </ToggleGroup>
              {isFetching && <span className="text-sm text-muted-foreground">Loading…</span>}
            </div>
            <div className="container mx-auto px-4 mt-6">
              <VenueFilters
                onFiltersChange={(f) => {
                  setFilters(f as any);
                  const ul = (f as any)?.userLocation;
                  if ((f as any)?.nearMe && ul && mapRef.current) {
                    (mapRef.current as mapboxgl.Map).easeTo({ center: [ul.longitude, ul.latitude], zoom: 12 });
                  }
                }}
              />
            </div>
          </div>
        </div>
        </>
      ) : (
        <div className="container mx-auto px-4">
          <Card>
            <CardHeader>
              <CardTitle>Explore Venues & Organizations Near You</CardTitle>
            </CardHeader>
            <CardContent>
              {(mapLoading || tokenLoading) ? (
                <div className="h-[480px] w-full rounded-lg bg-muted animate-pulse" aria-label="Loading map" />
              ) : (
                <div className="relative">
                  <div ref={mapContainer} className="h-[480px] w-full rounded-lg" />
                    <div className="absolute bottom-3 left-3 text-xs text-muted-foreground bg-background/70 backdrop-blur px-2 py-1 rounded">
                      Centered {ipLocated ? 'via IP location' : 'globally'}
                      {tokenError && <span className="ml-2 text-destructive">Error loading map</span>}
                    </div>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as any)}>
                  <ToggleGroupItem value="all" aria-label="Show all">All</ToggleGroupItem>
                  <ToggleGroupItem value="venues" aria-label="Show venues">Venues</ToggleGroupItem>
                  <ToggleGroupItem value="orgs" aria-label="Show organizations">Orgs</ToggleGroupItem>
                </ToggleGroup>
                {isFetching && <span className="text-sm text-muted-foreground">Loading…</span>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
};

export default FrontPageVenueMap;
