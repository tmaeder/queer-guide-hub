import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { useVenues } from '@/hooks/useVenues';
import { VenueCard } from './VenueCard';
import { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];

interface VenueMapSearchProps {
  className?: string;
}

export function VenueMapSearch({ className }: VenueMapSearchProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const mapboxToken = 'pk.eyJ1IjoidG1hZWRlciIsImEiOiJjazh4Ym9wOTEwN3F4M21zN3FqdnM4MHE2In0.24RlCLiCNxxX-c6h_4rwWw';
  
  const { venues, loading, fetchVenues } = useVenues();

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

    // Add markers for venues
    venues.forEach((venue) => {
      if (venue.latitude && venue.longitude) {
        const marker = new mapboxgl.Marker({
          color: '#6366f1'
        })
          .setLngLat([venue.longitude, venue.latitude])
          .addTo(map.current!);

        // Add popup on click
        const popup = new mapboxgl.Popup({ offset: 25 })
          .setHTML(`
            <div class="p-2">
              <h3 class="font-semibold">${venue.name}</h3>
              <p class="text-sm text-gray-600">${venue.category}</p>
              <p class="text-xs">${venue.city}, ${venue.state}</p>
            </div>
          `);
        
        marker.getElement().addEventListener('click', () => {
          setSelectedVenue(venue);
        });

        marker.setPopup(popup);
      }
    });
  };

  const handleSearch = () => {
    fetchVenues({ search: searchTerm });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  useEffect(() => {
    initializeMap();
    return () => {
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (map.current && venues.length > 0) {
      // Clear existing markers
      const markers = document.querySelectorAll('.mapboxgl-marker');
      markers.forEach(marker => marker.remove());
      
      // Add new markers
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
                <p class="text-sm text-gray-600">${venue.category}</p>
                <p class="text-xs">${venue.city}, ${venue.state}</p>
              </div>
            `);
          
          marker.getElement().addEventListener('click', () => {
            setSelectedVenue(venue);
          });

          marker.setPopup(popup);
        }
      });

      // Fit map to show all venues
      if (venues.length > 0) {
        const coordinates = venues
          .filter(v => v.latitude && v.longitude)
          .map(v => [v.longitude!, v.latitude!] as [number, number]);
        
        if (coordinates.length > 0) {
          const bounds = new mapboxgl.LngLatBounds();
          coordinates.forEach(coord => bounds.extend(coord));
          map.current.fitBounds(bounds, { padding: 50 });
        }
      }
    }
  }, [venues]);

  return (
    <div className={className}>
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Find Venues Near You</h3>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Map */}
              <div className="h-[400px] rounded-lg overflow-hidden border">
                <div ref={mapContainer} className="w-full h-full" />
              </div>

              {/* Selected Venue or List */}
              <div className="space-y-4">
                {selectedVenue ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">Selected Venue</h4>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setSelectedVenue(null)}
                      >
                        ✕
                      </Button>
                    </div>
                    <VenueCard venue={selectedVenue} />
                  </div>
                ) : (
                  <div>
                    <h4 className="font-semibold mb-2">
                      Found Venues ({venues.length})
                    </h4>
                    <div className="space-y-2 max-h-[350px] overflow-y-auto">
                      {venues.slice(0, 3).map((venue) => (
                        <div 
                          key={venue.id}
                          className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setSelectedVenue(venue)}
                        >
                          <h5 className="font-medium">{venue.name}</h5>
                          <p className="text-sm text-muted-foreground">
                            {venue.category} • {venue.city}, {venue.state}
                          </p>
                        </div>
                      ))}
                      {venues.length > 3 && (
                        <div className="text-center pt-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href="/venues">View All {venues.length} Venues</a>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}