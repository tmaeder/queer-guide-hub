import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useOptimizedVenues } from '@/hooks/useOptimizedVenues';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { VenueFilters } from '@/components/venues/VenueFilters';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import { mapStyle } from '@/config/mapStyle';

interface FrontPageVenueMapProps {
  className?: string;
  fullWidth?: boolean;
  heightClass?: string;
}

const DEFAULT_CENTER: [number, number] = [0, 20];
export const FrontPageVenueMap: React.FC<FrontPageVenueMapProps> = ({
  className,
  fullWidth,
  heightClass
}) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(2.2);
  const [ipLocated, setIpLocated] = useState(false);
  const [mode, setMode] = useState<'all' | 'venues' | 'orgs'>('all');
  const [filters, setFilters] = useState<any>({
    limit: 200
  });

  // Fetch approximate user location via IP (cached in sessionStorage)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = sessionStorage.getItem('ip_geo');
        if (cached) {
          const data = JSON.parse(cached);
          if (!cancelled && data.latitude && data.longitude) {
            setCenter([data.longitude, data.latitude]);
            setZoom(9);
            setIpLocated(true);
          }
          return;
        }
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) return;
        const data = await res.json();
        if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          sessionStorage.setItem('ip_geo', JSON.stringify({ latitude: data.latitude, longitude: data.longitude }));
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
  const {
    venues = [],
    isFetching
  } = (useOptimizedVenues as any)(filters);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    setMapLoading(true);
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: mapStyle,
      center: [center[0], center[1]],
      zoom: zoom,
    });
    map.addControl(new maplibregl.NavigationControl({
      visualizePitch: true
    }), 'top-right');
    map.scrollZoom.disable();
    map.on('load', () => {
      setMapLoading(false);
      mapRef.current = map;
    });
    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Update view when IP location arrives
  useEffect(() => {
    if (mapRef.current && ipLocated) {
      mapRef.current.easeTo({
        center: [center[0], center[1]],
        zoom
      });
    }
  }, [center, zoom, ipLocated]);

  // Apply "near me" filtering once IP location is known
  useEffect(() => {
    if (ipLocated) {
      setFilters((prev: any) => ({
        ...prev,
        nearMe: true,
        userLocation: {
          latitude: center[1],
          longitude: center[0]
        }
      }));
    }
  }, [ipLocated, center]);

  // Recenter map when userLocation filter is applied
  useEffect(() => {
    const map = mapRef.current;
    const ul = (filters as any)?.userLocation;
    if (!map || !ul) return;
    if ((filters as any)?.nearMe) {
      map.easeTo({
        center: [ul.longitude, ul.latitude],
        zoom: 12
      });
    }
  }, [filters?.userLocation, filters?.nearMe]);

  // Add markers for venues
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    const allWithCoords = (venues as any[]).filter(v => typeof v?.longitude === 'number' && typeof v?.latitude === 'number');
    const filtered = allWithCoords.filter(v => {
      const isOrg = String(v?.category ?? '').toLowerCase().includes('org');
      if (mode === 'all') return true;
      if (mode === 'orgs') return isOrg;
      return !isOrg;
    });
    const bounds = new maplibregl.LngLatBounds();
    filtered.forEach(venue => {
      const isOrg = String(venue?.category ?? '').toLowerCase().includes('org');
      const marker = new maplibregl.Marker({
        color: isOrg ? '#0ea5e9' : '#6366f1'
      }).setLngLat([venue.longitude, venue.latitude]).setPopup(new maplibregl.Popup({
        offset: 25
      }).setHTML(`
            <div class="p-2 min-w-[200px]">
              <strong>${venue.name ?? 'Venue'}</strong><br/>
              <span class="text-xs text-muted-foreground">${isOrg ? 'Organization' : venue.category ?? 'Venue'}</span><br/>
              <span class="text-xs">${venue.city ?? ''}</span>
            </div>
          `)).addTo(map);
      markersRef.current.push(marker);
      bounds.extend([venue.longitude, venue.latitude]);
    });
    if (markersRef.current.length > 0) {
      map.fitBounds(bounds, {
        padding: 60
      });
    }
  }, [venues, mode]);
  const mapHeight = fullWidth ? '60vh' : 480;

  const mapContent = (
    <Box sx={{ position: 'relative' }}>
      {/* Map container is always in the DOM so MapLibre can attach to it */}
      <Box ref={mapContainer} sx={{ height: mapHeight, width: '100%', borderRadius: fullWidth ? 0 : 2 }} />
      {mapLoading && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: fullWidth ? 0 : 2,
            bgcolor: 'action.hover',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            zIndex: 1,
          }}
          aria-label="Loading map"
        />
      )}
      <Box sx={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        fontSize: '0.75rem',
        color: 'text.secondary',
        bgcolor: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(4px)',
        px: 1,
        py: 0.5,
        borderRadius: 1,
        zIndex: 2,
      }}>
        Centered {ipLocated ? 'via IP location' : 'globally'}
      </Box>
    </Box>
  );

  return <Box component="section" className={className}>
      {fullWidth ? mapContent : <Container maxWidth="lg" sx={{ px: 2 }}>
          <Card>
            <CardHeader>
              <CardTitle>Explore Venues & Organizations Near You</CardTitle>
            </CardHeader>
            <CardContent>
              {mapContent}
              <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                <ToggleGroup type="single" value={mode} onValueChange={v => v && setMode(v as any)}>
                  <ToggleGroupItem value="all" aria-label="Show all">All</ToggleGroupItem>
                  <ToggleGroupItem value="venues" aria-label="Show venues">Venues</ToggleGroupItem>
                  <ToggleGroupItem value="orgs" aria-label="Show organizations">Orgs</ToggleGroupItem>
                </ToggleGroup>
                {isFetching && <Typography variant="body2" color="text.secondary">Loading...</Typography>}
              </Box>
            </CardContent>
          </Card>
        </Container>}
    </Box>;
};
export default FrontPageVenueMap;
