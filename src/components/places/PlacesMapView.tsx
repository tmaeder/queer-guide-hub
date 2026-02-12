import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { MapPin, Loader2, Globe, Building2 } from 'lucide-react';
import { PlacesCard } from './PlacesCard';
import { useSecureMapbox } from '@/hooks/useSecureMapbox';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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

interface PlacesMapViewProps {
  countries: Country[];
  cities: City[];
  loading?: boolean;
  onCountryClick?: (country: Country) => void;
  onCityClick?: (city: City) => void;
  className?: string;
}

type SelectedItem = Country | City | null;

export function PlacesMapView({
  countries,
  cities,
  loading = false,
  onCountryClick,
  onCityClick,
  className
}: PlacesMapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [showCities, setShowCities] = useState(true);
  const [mapboxToken] = useState('');


  const { token: secureToken } = useSecureMapbox();
  // Use hook token by default, allow manual override
  const activeToken = mapboxToken || secureToken || '';

  const initializeMap = () => {
    if (!mapContainer.current || !activeToken) {
      console.error('Mapbox token not configured. Please add VITE_MAPBOX_ACCESS_TOKEN to your environment or enter it below.');
      return;
    }

    mapboxgl.accessToken = activeToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/tmaeder/clvmrc8pj015p01o05wd581tt',
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

      // Add markers based on switch state
      if (showCities) {
        // Show cities
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
                <div style="padding: 12px;">
                  <h3 style="font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    <span style="color: #2563eb;">&#127959;</span>
                    ${city.name}
                  </h3>
                  <p style="font-size: 0.875rem; color: var(--muted-foreground);">
                    ${isCapital ? 'Capital City' : isMajor ? 'Major City' : 'City'}
                  </p>
                  ${city.population ? `<p style="font-size: 0.75rem;">Population: ${city.population.toLocaleString()}</p>` : ''}
                </div>
              `);

            marker.getElement().addEventListener('click', () => {
              setSelectedItem(city);
            });

            marker.setPopup(popup);
          }
        });
      } else {
        // Show countries
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
                <div style="padding: 12px;">
                  <h3 style="font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    <span style="color: #dc2626;">&#127963;</span>
                    ${country.name}
                  </h3>
                  <p style="font-size: 0.875rem; color: var(--muted-foreground);">Country</p>
                  ${country.capital ? `<p style="font-size: 0.75rem;">Capital: ${country.capital}</p>` : ''}
                </div>
              `);

            marker.getElement().addEventListener('click', () => {
              setSelectedItem(country);
            });

            marker.setPopup(popup);
          }
        });
      }

      // Fit map to show all points
      const allCoordinates: [number, number][] = [];

      if (showCities) {
        allCoordinates.push(
          ...cities
            .filter(c => c.latitude && c.longitude)
            .map(c => [c.longitude!, c.latitude!] as [number, number])
        );
      } else {
        allCoordinates.push(
          ...countries
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


  return (
    <Box className={className}>
      <Card>
        <CardContent style={{ padding: 24 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Globe style={{ height: 20, width: 20, color: 'var(--primary)' }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>Geographic Map View</Typography>
            </Box>


            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#dc2626' }} />
                <Typography variant="body2">Countries</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#f59e0b' }} />
                <Typography variant="body2">Capital Cities</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#3b82f6' }} />
                <Typography variant="body2">Major Cities</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#6b7280' }} />
                <Typography variant="body2">Other Cities</Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 'auto' }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Countries</Typography>
                <Switch
                  checked={showCities}
                  onCheckedChange={setShowCities}
                />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Cities</Typography>
              </Box>
            </Box>

            {loading && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 2 }}>
                <Loader2 style={{ height: 20, width: 20, animation: 'spin 1s linear infinite', marginRight: 8 }} />
                <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Loading map data...</Typography>
              </Box>
            )}

            {!activeToken ? (
              <Box sx={{ height: 600, width: '100%', borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'grey.50', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Globe style={{ height: 48, width: 48, color: '#9ca3af', margin: '0 auto 16px' }} />
                  <Typography sx={{ color: 'var(--muted-foreground)' }}>Map is unavailable right now.</Typography>
                </Box>
              </Box>
            ) : (
              <Box sx={{ height: 600, width: '100%', borderRadius: 2, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
                <Box ref={mapContainer} sx={{ width: '100%', height: '100%' }} />
              </Box>
            )}

            {selectedItem && (
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography sx={{ fontWeight: 600 }}>
                    Selected {isCity(selectedItem) ? 'City' : 'Country'}
                  </Typography>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedItem(null)}
                  >
                    &#10005;
                  </Button>
                </Box>
                <Box sx={{ maxWidth: 448 }}>
                  <PlacesCard
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
                </Box>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
