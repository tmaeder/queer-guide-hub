import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Filter, ChevronDown } from 'lucide-react';
import { useVenues } from '@/hooks/useVenues';
import { useRestrooms } from '@/hooks/useRestrooms';
import { VenueCard } from './VenueCard';
import { VenueFilters } from '@/components/venues/VenueFilters';
import { Database } from '@/integrations/supabase/types';
import { useSecureMapbox } from '@/hooks/useSecureMapbox';
type Venue = Database['public']['Tables']['venues']['Row'];
type SelectedItem = Venue | {
  type: 'restroom';
  id: number;
  name: string;
  city: string;
  state: string;
  accessible: boolean;
  unisex: boolean;
};
interface VenueMapSearchProps {
  className?: string;
  externalSearchTerm?: string;
  onSearchChange?: (term: string) => void;
  filters?: {
    city?: string;
    category?: string;
    tags?: string[];
    amenities?: string[];
    services?: string[];
    search?: string;
  };
}
export function VenueMapSearch({
  className,
  externalSearchTerm = '',
  onSearchChange,
  filters
}: VenueMapSearchProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
const [searchTerm, setSearchTerm] = useState(externalSearchTerm);
const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
const [showRestrooms, setShowRestrooms] = useState(false);
const [mode, setMode] = useState<'venues' | 'organizations'>('venues');
const [filtersOpen, setFiltersOpen] = useState(false);
  const {
    token: mapboxToken,
    loading: mapTokenLoading
  } = useSecureMapbox();
  const {
    venues,
    loading: venuesLoading,
    fetchVenues
  } = useVenues();
  const {
    restrooms,
    loading: restroomsLoading,
    fetchRestrooms
  } = useRestrooms();

  // Mapbox token is provided by useSecureMapbox hook

  const initializeMap = () => {
    if (!mapContainer.current || !mapboxToken) {
      console.error('Mapbox token not available');
      return;
    }
    mapboxgl.accessToken = mapboxToken;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/tmaeder/clvmrc8pj015p01o05wd581tt',
      center: [-74.006, 40.7128],
      // NYC default
      zoom: 12
    });
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
  };
  const handleSearch = () => {
    const searchFilters = {
      ...filters,
      search: searchTerm
    };
    fetchVenues(searchFilters);
    onSearchChange?.(searchTerm);

    // Also fetch restrooms for the current map bounds
    if (map.current && showRestrooms) {
      const center = map.current.getCenter();
      fetchRestrooms({
        lat: center.lat,
        lng: center.lng,
        per_page: 50
      });
    }
  };
  const handleAdvancedFilters = (adv: Record<string, any>) => {
    const combined: Record<string, any> = { ...(filters || {}), ...adv };
    if (mode === 'organizations') {
      combined.category = 'organization';
    }
    fetchVenues(combined);
  };
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };
  const loading = venuesLoading || restroomsLoading;
  useEffect(() => {
    if (mapboxToken) {
      initializeMap();
      // Fetch initial restrooms for a general area (NYC)
      fetchRestrooms({
        lat: 40.7128,
        lng: -74.006,
        per_page: 50
      });
    }
    return () => {
      map.current?.remove();
    };
  }, [mapboxToken]);

  // Apply filters when they change
  useEffect(() => {
    if (filters) {
      fetchVenues(filters);
    }
  }, [filters]);
  useEffect(() => {
    if (map.current && (venues.length > 0 || restrooms.length > 0)) {
      // Clear existing markers
      const markers = document.querySelectorAll('.mapboxgl-marker');
      markers.forEach(marker => marker.remove());

      // Add venue markers
      venues.forEach(venue => {
        if (venue.latitude && venue.longitude) {
          const marker = new mapboxgl.Marker({
            color: '#6366f1'
          }).setLngLat([venue.longitude, venue.latitude]).addTo(map.current!);
          const popup = new mapboxgl.Popup({
            offset: 25
          }).setHTML(`
              <div class="p-2">
                <h3 class="font-semibold">${venue.name}</h3>
                <p class="text-sm text-muted-foreground">${venue.category}</p>
                <p class="text-xs">${venue.city}, ${venue.state}</p>
              </div>
            `);
          marker.getElement().addEventListener('click', () => {
            setSelectedItem(venue);
          });
          marker.setPopup(popup);
        }
      });

      // Add restroom markers
      if (showRestrooms) {
        restrooms.forEach(restroom => {
          if (restroom.latitude && restroom.longitude) {
            const marker = new mapboxgl.Marker({
              color: '#10b981' // green for restrooms
            }).setLngLat([restroom.longitude, restroom.latitude]).addTo(map.current!);
            const popup = new mapboxgl.Popup({
              offset: 25
            }).setHTML(`
                <div class="p-2">
                  <h3 class="font-semibold">${restroom.name}</h3>
                  <p class="text-sm text-muted-foreground">Restroom</p>
                  <p class="text-xs">${restroom.city}, ${restroom.state}</p>
                  <div class="flex gap-2 mt-1">
                     ${restroom.accessible ? '<span class="text-xs bg-muted px-1 rounded">Accessible</span>' : ''}
                     ${restroom.unisex ? '<span class="text-xs bg-muted px-1 rounded">Unisex</span>' : ''}
                  </div>
                </div>
              `);
            marker.getElement().addEventListener('click', () => {
              setSelectedItem({
                type: 'restroom',
                id: restroom.id,
                name: restroom.name,
                city: restroom.city,
                state: restroom.state,
                accessible: restroom.accessible,
                unisex: restroom.unisex
              });
            });
            marker.setPopup(popup);
          }
        });
      }

      // Fit map to show all points
      const allCoordinates = [...venues.filter(v => v.latitude && v.longitude).map(v => [v.longitude!, v.latitude!] as [number, number]), ...restrooms.filter(r => r.latitude && r.longitude).map(r => [r.longitude, r.latitude] as [number, number])];
      if (allCoordinates.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        allCoordinates.forEach(coord => bounds.extend(coord));
        map.current.fitBounds(bounds, {
          padding: 50
        });
      }
    }
  }, [venues, restrooms, showRestrooms]);

  // Sync with external search term
  useEffect(() => {
    if (externalSearchTerm !== searchTerm) {
      setSearchTerm(externalSearchTerm);
      if (externalSearchTerm) {
        const searchFilters = {
          ...filters,
          search: externalSearchTerm
        };
        fetchVenues(searchFilters);
      }
    }
  }, [externalSearchTerm, filters]);
  return (
    <Box sx={className ? {} : { width: '100%' }}>
      <Box sx={{ height: 500, width: '100%', borderRadius: 2, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
        <Box ref={mapContainer} sx={{ width: '100%', height: '100%' }} />
      </Box>
      <Box sx={{ mt: 1 }}>
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(v) => v && setMode(v as 'venues' | 'organizations')}
              >
                <ToggleGroupItem value="venues" aria-label="Venues">
                  Venues
                </ToggleGroupItem>
                <ToggleGroupItem value="organizations" aria-label="Organizations">
                  Organizations
                </ToggleGroupItem>
              </ToggleGroup>
            </Box>

            <Button variant="outline" size="icon" aria-label="Toggle filters" onClick={() => setFiltersOpen(!filtersOpen)}>
              <Filter style={{ width: 16, height: 16 }} />
            </Button>
          </Box>

          <CollapsibleContent sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Button variant="outline" size="sm" onClick={() => setShowRestrooms(!showRestrooms)}>
                {showRestrooms ? 'Hide' : 'Show'} Restrooms
              </Button>
            </Box>
            <VenueFilters onFiltersChange={handleAdvancedFilters} />
          </CollapsibleContent>
        </Collapsible>
      </Box>
      {selectedItem && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Selected {selectedItem && 'type' in selectedItem ? 'Restroom' : 'Venue'}
            </Typography>
            <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)}>
              ✕
            </Button>
          </Box>
          <Box sx={{ maxWidth: '28rem' }}>
            {selectedItem && 'type' in selectedItem ? (
              <Card>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>{selectedItem.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Restroom • {selectedItem.city}, {selectedItem.state}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    {selectedItem.accessible && (
                      <Box component="span" sx={{ fontSize: '0.75rem', bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1 }}>
                        Accessible
                      </Box>
                    )}
                    {selectedItem.unisex && (
                      <Box component="span" sx={{ fontSize: '0.75rem', bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 1 }}>
                        Unisex
                      </Box>
                    )}
                  </Box>
                </CardContent>
              </Card>
            ) : (
              <VenueCard venue={selectedItem as Venue} />
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}