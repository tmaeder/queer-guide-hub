import React, { useEffect, useMemo, useRef, useState } from 'react';
// Switched to Google Maps - no maplibre import
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { useOptimizedVenues } from '@/hooks/useOptimizedVenues';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { VenueFilters } from '@/components/venues/VenueFilters';
import { useSecureGoogleMaps } from '@/hooks/useSecureGoogleMaps';
interface FrontPageVenueMapProps {
  className?: string;
  fullWidth?: boolean;
  heightClass?: string;
}

// Google Maps configuration
const DEFAULT_CENTER: [number, number] = [0, 20];

export const FrontPageVenueMap: React.FC<FrontPageVenueMapProps> = ({ className, fullWidth, heightClass }) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const markersRef = useRef<any[]>([]);
  const [mapLoading, setMapLoading] = useState(true);

  const { loaded: mapsLoaded, loading: mapsLoading, error: mapsError } = useSecureGoogleMaps();

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

  // Initialize Google map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !mapsLoaded) return;
    setMapLoading(true);

    mapRef.current = new google.maps.Map(mapContainer.current, {
      center: { lng: center[0], lat: center[1] },
      zoom: zoom,
      mapTypeId: 'roadmap',
      gestureHandling: 'greedy',
      fullscreenControl: false,
      streetViewControl: false,
      mapTypeControl: false,
    });

    setMapLoading(false);

    return () => {
      mapRef.current = null;
    };
  }, [mapsLoaded]);

  // Update view when IP location arrives
  useEffect(() => {
    if (mapRef.current && ipLocated) {
      mapRef.current.setZoom(zoom);
      mapRef.current.panTo({ lng: center[0], lat: center[1] });
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
    const map = mapRef.current as any;
    const ul = (filters as any)?.userLocation;
    if (!map || !ul) return;
    if ((filters as any)?.nearMe) {
      map.setZoom(12);
      map.panTo({ lng: ul.longitude, lat: ul.latitude });
    }
  }, [filters?.userLocation, filters?.nearMe]);

  // Add markers for venues
  useEffect(() => {
    const map = mapRef.current as google.maps.Map | null;
    if (!map || !mapsLoaded) return;

    // Clear existing markers
    markersRef.current.forEach((m: any) => m.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    const allWithCoords = (venues as any[])
      .filter(v => typeof v?.longitude === 'number' && typeof v?.latitude === 'number');

    const filtered = allWithCoords.filter((v) => {
      const isOrg = String(v?.category ?? '').toLowerCase().includes('org');
      if (mode === 'all') return true;
      if (mode === 'orgs') return isOrg;
      return !isOrg;
    });

    const infoWindow = new google.maps.InfoWindow();

    filtered.forEach((venue) => {
      const isOrg = String(venue?.category ?? '').toLowerCase().includes('org');

      const color = getComputedStyle(document.documentElement)
        .getPropertyValue(isOrg ? '--accent' : '--primary').trim();
      const icon: google.maps.Symbol = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: color || '#111',
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: getComputedStyle(document.documentElement)
          .getPropertyValue('--background').trim() || '#fff',
      };

      const marker = new google.maps.Marker({
        position: { lng: venue.longitude, lat: venue.latitude },
        map,
        icon,
        title: venue.name ?? 'Venue',
      });

      marker.addListener('click', () => {
        infoWindow.setContent(`
          <div style="min-width:200px">
            <strong>${venue.name ?? 'Venue'}</strong><br/>
            <span>${isOrg ? 'Organization' : (venue.category ?? 'Venue')}</span><br/>
            ${venue.city ?? ''}
          </div>
        `);
        infoWindow.open({ anchor: marker, map });
      });

      markersRef.current.push(marker);
      bounds.extend(new google.maps.LatLng(venue.latitude, venue.longitude));
    });

    if (markersRef.current.length > 0) {
      map.fitBounds(bounds, { padding: 60 } as any);
    }
  }, [venues, mode, mapsLoaded]);


  return (
    <section className={className}>
      {fullWidth ? (<>
          <div className="w-full">
          {mapLoading ? (
            <div className={`${heightClass ?? 'h-[480px]'} w-full bg-muted animate-pulse`} aria-label="Loading map" />
          ) : (
            <div className="relative">
              <div ref={mapContainer} className={`${heightClass ?? 'h-[480px]'} w-full`} />
                <div className="absolute bottom-3 left-3 text-xs text-muted-foreground bg-background/70 backdrop-blur px-2 py-1 rounded">
                  Centered {ipLocated ? 'via IP location' : 'globally'}
                  {mapsError && <span className="ml-2 text-destructive">Error loading map</span>}
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
                    (mapRef.current as google.maps.Map).setZoom(12);
                    (mapRef.current as google.maps.Map).panTo({ lng: ul.longitude, lat: ul.latitude });
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
              {mapLoading ? (
                <div className="h-[480px] w-full rounded-lg bg-muted animate-pulse" aria-label="Loading map" />
              ) : (
                <div className="relative">
                  <div ref={mapContainer} className="h-[480px] w-full rounded-lg" />
                    <div className="absolute bottom-3 left-3 text-xs text-muted-foreground bg-background/70 backdrop-blur px-2 py-1 rounded">
                      Centered {ipLocated ? 'via IP location' : 'globally'}
                      {mapsError && <span className="ml-2 text-destructive">Error loading map</span>}
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
