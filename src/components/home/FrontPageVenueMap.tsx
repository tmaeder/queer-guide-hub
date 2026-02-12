import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useOptimizedVenues } from '@/hooks/useOptimizedVenues';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { VenueFilters } from '@/components/venues/VenueFilters';
import { useSecureMapbox } from '@/hooks/useSecureMapbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';

interface FrontPageVenueMapProps {
  className?: string;
  fullWidth?: boolean;
  heightClass?: string;
}

// Google Maps configuration
const DEFAULT_CENTER: [number, number] = [0, 20];
export const FrontPageVenueMap: React.FC<FrontPageVenueMapProps> = ({
  className,
  fullWidth,
  heightClass
}) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const {
    token,
    loading: tokenLoading,
    error: tokenError
  } = useSecureMapbox();
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(2.2);
  const [ipLocated, setIpLocated] = useState(false);
  const [mode, setMode] = useState<'all' | 'venues' | 'orgs'>('all');
  const [filters, setFilters] = useState<any>({
    limit: 200
  });
  const [manualToken, setManualToken] = useState('');
  useEffect(() => {
    try {
      const t = localStorage.getItem('mapbox_public_token');
      if (t) setManualToken(t);
    } catch {}
  }, []);
  const mapToken = token || manualToken;

  // Fetch approximate user location via IP (cached in sessionStorage)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Check sessionStorage cache first
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

  // Initialize Mapbox map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current || !mapToken) return;
    setMapLoading(true);
    mapboxgl.accessToken = mapToken;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/tmaeder/clvmrc8pj015p01o05wd581tt',
      center: [center[0], center[1]],
      zoom: zoom,
      projection: 'globe'
    });
    map.addControl(new mapboxgl.NavigationControl({
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
  }, [mapToken]);

  // Update view when IP location arrives
  useEffect(() => {
    if (mapRef.current && ipLocated) {
      (mapRef.current as mapboxgl.Map).easeTo({
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
    const map = mapRef.current as mapboxgl.Map | null;
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
    const map = mapRef.current as mapboxgl.Map | null;
    if (!map || !mapToken) return;

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
    const bounds = new mapboxgl.LngLatBounds();
    filtered.forEach(venue => {
      const isOrg = String(venue?.category ?? '').toLowerCase().includes('org');
      const marker = new mapboxgl.Marker({
        color: isOrg ? '#0ea5e9' : '#6366f1'
      }).setLngLat([venue.longitude, venue.latitude]).setPopup(new mapboxgl.Popup({
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
  }, [venues, mode, mapToken]);
  return <Box component="section" className={className}>
      {fullWidth ? <>

        </> : <Container maxWidth="lg" sx={{ px: 2 }}>
          <Card>
            <CardHeader>
              <CardTitle>Explore Venues & Organizations Near You</CardTitle>
            </CardHeader>
            <CardContent>
              {(((mapLoading && Boolean(mapToken)) || tokenLoading)) ? (
                <Box
                  sx={{ height: 480, width: '100%', borderRadius: 2, bgcolor: 'action.hover', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}
                  aria-label="Loading map"
                />
              ) : (
                <Box sx={{ position: 'relative' }}>
                  <Box ref={mapContainer} sx={{ height: 480, width: '100%', borderRadius: 2 }} />
                  <Box sx={{
                    position: 'absolute',
                    bottom: 12,
                    left: 12,
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    bgcolor: 'rgba(var(--background), 0.7)',
                    backdropFilter: 'blur(4px)',
                    px: 1,
                    py: 0.5,
                    borderRadius: 1
                  }}>
                    Centered {ipLocated ? 'via IP location' : 'globally'}
                    {tokenError && <Typography component="span" sx={{ ml: 1, color: 'error.main' }}>Error loading map</Typography>}
                  </Box>
                </Box>
              )}
              {!mapToken && !tokenLoading && (
                <Box sx={{ mt: 1.5, borderRadius: 2, border: 1, borderColor: 'divider', p: 1.5, fontSize: '0.875rem' }}>
                  <Typography variant="body2" sx={{ mb: 1 }}>Mapbox token required. Paste your public token to enable the map.</Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Input
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      placeholder="pk.eyJ..."
                      aria-label="Mapbox public token"
                    />
                    <Button
                      onClick={() => {
                        try { localStorage.setItem('mapbox_public_token', manualToken); } catch {}
                        setManualToken(manualToken);
                      }}
                    >
                      Save token
                    </Button>
                  </Box>
                  {tokenError && <Typography variant="body2" sx={{ mt: 1, color: 'error.main' }}>Secure token fetch failed; using local token.</Typography>}
                </Box>
              )}
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
