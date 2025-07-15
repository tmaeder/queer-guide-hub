import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { useVenues } from '@/hooks/useVenues';
import { useRestrooms } from '@/hooks/useRestrooms';
import { VenueCard } from './VenueCard';
import { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];
type SelectedItem = Venue | { type: 'restroom'; id: number; name: string; city: string; state: string; accessible: boolean; unisex: boolean; };

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

export function VenueMapSearch({ className, externalSearchTerm = '', onSearchChange, filters }: VenueMapSearchProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [searchTerm, setSearchTerm] = useState(externalSearchTerm);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [showRestrooms, setShowRestrooms] = useState(true);
  const mapboxToken = 'pk.eyJ1IjoidG1hZWRlciIsImEiOiJjazh4Ym9wOTEwN3F4M21zN3FqdnM4MHE2In0.24RlCLiCNxxX-c6h_4rwWw';
  
  const { venues, loading: venuesLoading, fetchVenues } = useVenues();
  const { restrooms, loading: restroomsLoading, fetchRestrooms } = useRestrooms();

  const initializeMap = () => {
    if (!mapContainer.current) return;

    mapboxgl.accessToken = mapboxToken;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-74.006, 40.7128], // NYC default
      zoom: 12,
    });

    map.current.addControl(
      new mapboxgl.NavigationControl(),
      'top-right'
    );
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const loading = venuesLoading || restroomsLoading;

  useEffect(() => {
    initializeMap();
    // Fetch initial restrooms for a general area (NYC)
    fetchRestrooms({
      lat: 40.7128,
      lng: -74.006,
      per_page: 50
    });
    return () => {
      map.current?.remove();
    };
  }, []);

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
      venues.forEach((venue) => {
        if (venue.latitude && venue.longitude) {
          const marker = new mapboxgl.Marker({
            color: '#6366f1'
          })
            .setLngLat([venue.longitude, venue.latitude])
            .addTo(map.current!);

          const popup = new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
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
        restrooms.forEach((restroom) => {
          if (restroom.latitude && restroom.longitude) {
            const marker = new mapboxgl.Marker({
              color: '#10b981' // green for restrooms
            })
              .setLngLat([restroom.longitude, restroom.latitude])
              .addTo(map.current!);

            const popup = new mapboxgl.Popup({ offset: 25 })
              .setHTML(`
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
      const allCoordinates = [
        ...venues
          .filter(v => v.latitude && v.longitude)
          .map(v => [v.longitude!, v.latitude!] as [number, number]),
        ...restrooms
          .filter(r => r.latitude && r.longitude)
          .map(r => [r.longitude, r.latitude] as [number, number])
      ];
      
      if (allCoordinates.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        allCoordinates.forEach(coord => bounds.extend(coord));
        map.current.fitBounds(bounds, { padding: 50 });
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
    <div className={className}>
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Find Venues & Restrooms Near You</h3>
            </div>
            
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search venues..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="pl-10"
                />
              </div>
              <Button onClick={handleSearch} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary"></div>
                <span className="text-sm">Venues</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-muted-foreground"></div>
                <span className="text-sm">Restrooms</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRestrooms(!showRestrooms)}
              >
                {showRestrooms ? 'Hide' : 'Show'} Restrooms
              </Button>
            </div>

            <div className="h-[500px] w-full rounded-lg overflow-hidden border">
              <div ref={mapContainer} className="w-full h-full" />
            </div>

            {selectedItem && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">
                    Selected {selectedItem && 'type' in selectedItem ? 'Restroom' : 'Venue'}
                  </h4>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedItem(null)}
                  >
                    ✕
                  </Button>
                </div>
                <div className="max-w-md">
                  {selectedItem && 'type' in selectedItem ? (
                    <Card>
                      <CardContent className="p-4">
                        <h5 className="font-medium">{selectedItem.name}</h5>
                        <p className="text-sm text-muted-foreground">
                          Restroom • {selectedItem.city}, {selectedItem.state}
                        </p>
                        <div className="flex gap-2 mt-2">
                          {selectedItem.accessible && (
                             <span className="text-xs bg-muted px-2 py-1 rounded">
                               Accessible
                             </span>
                           )}
                           {selectedItem.unisex && (
                             <span className="text-xs bg-muted px-2 py-1 rounded">
                               Unisex
                             </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <VenueCard venue={selectedItem as Venue} />
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}