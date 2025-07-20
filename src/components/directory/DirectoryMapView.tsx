import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MapPin, Loader2, Globe, Building2 } from 'lucide-react';
import { DirectoryCard } from './DirectoryCard';

interface Country {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  continent_id?: string;
  capital?: string;
}

interface City {
  id: string;
  name: string;
  country_id: string;
  latitude?: number;
  longitude?: number;
  population?: number;
  is_capital?: boolean;
  is_major_city?: boolean;
}

interface DirectoryMapViewProps {
  countries: Country[];
  cities: City[];
  loading?: boolean;
  onCountryClick?: (country: Country) => void;
  onCityClick?: (city: City) => void;
  className?: string;
}

type SelectedItem = Country | City | null;

export function DirectoryMapView({ 
  countries, 
  cities, 
  loading = false, 
  onCountryClick, 
  onCityClick,
  className 
}: DirectoryMapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [showCities, setShowCities] = useState(true);
  const [mapboxToken, setMapboxToken] = useState(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1IjoidG1hZWRlciIsImEiOiJjazh4Ym9wOTEwN3F4M21zN3FqdnM4MHE2In0.24RlCLiCNxxX-c6h_4rwWw');
  const [showTokenInput, setShowTokenInput] = useState(false);
  
  // Use the provided token or environment token
  const activeToken = mapboxToken || import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

  const initializeMap = () => {
    if (!mapContainer.current || !activeToken) {
      console.error('Mapbox token not configured. Please add VITE_MAPBOX_ACCESS_TOKEN to your environment or enter it below.');
      return;
    }

    mapboxgl.accessToken = activeToken;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [0, 20], // Center on world view
      zoom: 2,
      projection: 'globe' as any
    });

    map.current.addControl(
      new mapboxgl.NavigationControl(),
      'top-right'
    );

    // Add atmosphere and fog effects for globe
    map.current.on('style.load', () => {
      map.current?.setFog({
        color: 'rgb(255, 255, 255)',
        'high-color': 'rgb(200, 200, 225)',
        'horizon-blend': 0.02,
      });
    });
  };

  const isCity = (item: SelectedItem): item is City => {
    return item !== null && 'country_id' in item;
  };

  const isCountry = (item: SelectedItem): item is Country => {
    return item !== null && 'continent_id' in item;
  };

  useEffect(() => {
    if (activeToken) {
      initializeMap();
    }
    return () => {
      map.current?.remove();
    };
  }, [activeToken]);

  useEffect(() => {
    if (map.current && activeToken && (countries.length > 0 || cities.length > 0)) {
      // Clear existing markers
      const markers = document.querySelectorAll('.mapboxgl-marker');
      markers.forEach(marker => marker.remove());
      
      // Add country markers (capitals)
      if (!showCities) {
        countries.forEach((country) => {
          if (country.latitude && country.longitude) {
            const marker = new mapboxgl.Marker({
              color: '#dc2626', // red for countries
              scale: 0.8
            })
              .setLngLat([country.longitude, country.latitude])
              .addTo(map.current!);

            const popup = new mapboxgl.Popup({ offset: 25 })
              .setHTML(`
                <div class="p-3">
                  <h3 class="font-semibold flex items-center gap-2">
                    <span class="text-red-600">🏛️</span>
                    ${country.name}
                  </h3>
                  <p class="text-sm text-muted-foreground">Country</p>
                  ${country.capital ? `<p class="text-xs">Capital: ${country.capital}</p>` : ''}
                </div>
              `);
            
            marker.getElement().addEventListener('click', () => {
              setSelectedItem(country);
            });

            marker.setPopup(popup);
          }
        });
      }

      // Add city markers
      if (showCities) {
        cities.forEach((city) => {
          if (city.latitude && city.longitude) {
            const isCapital = city.is_capital;
            const isMajor = city.is_major_city;
            
            const marker = new mapboxgl.Marker({
              color: isCapital ? '#f59e0b' : isMajor ? '#3b82f6' : '#6b7280', // amber for capitals, blue for major cities, gray for others
              scale: isCapital ? 0.9 : isMajor ? 0.7 : 0.5
            })
              .setLngLat([city.longitude, city.latitude])
              .addTo(map.current!);

            const popup = new mapboxgl.Popup({ offset: 25 })
              .setHTML(`
                <div class="p-3">
                  <h3 class="font-semibold flex items-center gap-2">
                    <span class="text-blue-600">🏙️</span>
                    ${city.name}
                  </h3>
                  <p class="text-sm text-muted-foreground">
                    ${isCapital ? 'Capital City' : isMajor ? 'Major City' : 'City'}
                  </p>
                  ${city.population ? `<p class="text-xs">Population: ${city.population.toLocaleString()}</p>` : ''}
                </div>
              `);
            
            marker.getElement().addEventListener('click', () => {
              setSelectedItem(city);
            });

            marker.setPopup(popup);
          }
        });
      }

      // Fit map to show all points
      const allCoordinates: [number, number][] = [];
      
      if (!showCities) {
        allCoordinates.push(
          ...countries
            .filter(c => c.latitude && c.longitude)
            .map(c => [c.longitude!, c.latitude!] as [number, number])
        );
      }
      
      if (showCities) {
        allCoordinates.push(
          ...cities
            .filter(c => c.latitude && c.longitude)
            .map(c => [c.longitude!, c.latitude!] as [number, number])
        );
      }
      
      if (allCoordinates.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        allCoordinates.forEach(coord => bounds.extend(coord));
        map.current.fitBounds(bounds, { padding: 50, maxZoom: 6 });
      }
    }
  }, [countries, cities, showCities, activeToken]);

  const handleTokenSubmit = () => {
    if (mapboxToken.trim()) {
      setShowTokenInput(false);
    }
  };

  return (
    <div className={className}>
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Geographic Map View</h3>
            </div>
            
            {showTokenInput && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-medium text-yellow-800 mb-2">Mapbox Token Required</h4>
                <p className="text-sm text-yellow-700 mb-3">
                  Please enter your Mapbox public token. Get one free at <a href="https://mapbox.com" target="_blank" rel="noopener noreferrer" className="underline">mapbox.com</a>
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="pk.eyJ1IjoieW91cnVzZXJuYW1lIiwiYSI6IlYourTokenHere"
                    value={mapboxToken}
                    onChange={(e) => setMapboxToken(e.target.value)}
                    className="flex-1 px-3 py-2 border border-yellow-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                  <Button onClick={handleTokenSubmit} disabled={!mapboxToken.trim()}>
                    Load Map
                  </Button>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-600"></div>
                <span className="text-sm">Countries</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <span className="text-sm">Capital Cities</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-sm">Major Cities</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                <span className="text-sm">Other Cities</span>
              </div>
              
              <div className="flex items-center gap-3 ml-auto">
                <span className="text-sm font-medium">Countries</span>
                <Switch 
                  checked={showCities}
                  onCheckedChange={setShowCities}
                />
                <span className="text-sm font-medium">Cities</span>
              </div>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Loading map data...</span>
              </div>
            )}

            {!activeToken ? (
              <div className="h-[600px] w-full rounded-lg border bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                  <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Please enter your Mapbox token above to load the map</p>
                </div>
              </div>
            ) : (
              <div className="h-[600px] w-full rounded-lg overflow-hidden border">
                <div ref={mapContainer} className="w-full h-full" />
              </div>
            )}

            {selectedItem && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">
                    Selected {isCity(selectedItem) ? 'City' : 'Country'}
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
                  <DirectoryCard
                    type={isCity(selectedItem) ? 'city' : 'country'}
                    name={selectedItem.name}
                    data={selectedItem}
                    onClick={() => {
                      if (isCity(selectedItem)) {
                        onCityClick?.(selectedItem);
                      } else if (isCountry(selectedItem)) {
                        onCountryClick?.(selectedItem);
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}