import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import { useSecureMapbox } from '@/hooks/useSecureMapbox';

interface CountryData {
  country: string;
  count: number;
  percentage: number;
}

interface UmamiMapProps {
  countryData: CountryData[];
  loading?: boolean;
}

// Country coordinates mapping for popular countries
const countryCoordinates: Record<string, [number, number]> = {
  'United States': [-95.7129, 37.0902],
  'Germany': [10.4515, 51.1657],
  'United Kingdom': [-3.4360, 55.3781],
  'France': [2.2137, 46.2276],
  'Canada': [-106.3468, 56.1304],
  'Australia': [133.7751, -25.2744],
  'Japan': [138.2529, 36.2048],
  'Brazil': [-51.9253, -14.2350],
  'India': [78.9629, 20.5937],
  'China': [104.1954, 35.8617],
  'Russia': [105.3188, 61.5240],
  'Spain': [-3.7492, 40.4637],
  'Italy': [12.5674, 41.8719],
  'Netherlands': [5.2913, 52.1326],
  'Switzerland': [8.2275, 46.8182],
  'Austria': [14.5501, 47.5162],
  'Belgium': [4.4699, 50.5039],
  'Sweden': [18.6435, 60.1282],
  'Norway': [8.4689, 60.4720],
  'Denmark': [9.5018, 56.2639],
  'Finland': [25.7482, 61.9241],
  'Poland': [19.1343, 51.9194],
  'Czech Republic': [15.4730, 49.8175],
  'Portugal': [-8.2245, 39.3999],
  'Greece': [21.8243, 39.0742],
  'Turkey': [35.2433, 38.9637],
  'South Korea': [127.7669, 35.9078],
  'Mexico': [-102.5528, 23.6345],
  'Argentina': [-63.6167, -38.4161],
  'Chile': [-71.5430, -35.6751],
  'South Africa': [22.9375, -30.5595],
  'Egypt': [30.8025, 26.8206],
  'Israel': [34.8516, 32.4279],
  'UAE': [53.8478, 23.4241],
  'Saudi Arabia': [45.0792, 23.8859],
  'Singapore': [103.8198, 1.3521],
  'Thailand': [100.9925, 15.8700],
  'Indonesia': [113.9213, -0.7893],
  'Philippines': [121.7740, 12.8797],
  'Vietnam': [108.2772, 14.0583],
  'Malaysia': [101.9758, 4.2105],
  'Taiwan': [120.9605, 23.6978],
  'Hong Kong': [114.1694, 22.3193],
  'New Zealand': [174.8860, -40.9006],
  'Ireland': [-8.2439, 53.4129],
  'Iceland': [-19.0208, 64.9631],
  'Luxembourg': [6.1296, 49.8153],
  'Monaco': [7.4167, 43.7333],
  'Liechtenstein': [9.5554, 47.1410],
  'San Marino': [12.4464, 43.9424],
  'Vatican City': [12.4534, 41.9029],
  'Malta': [14.3754, 35.9375],
  'Cyprus': [33.4299, 35.1264],
  'Andorra': [1.5218, 42.5063],
};

export const UmamiMap = ({ countryData, loading = false }: UmamiMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const { token: mapboxToken } = useSecureMapbox();

  useEffect(() => {
    if (!mapContainer.current || loading || !mapboxToken) return;

    // Initialize map only once
    if (!map.current) {
      mapboxgl.accessToken = mapboxToken;
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        zoom: 1.5,
        center: [0, 20],
        projection: 'globe' as any,
      });

      // Add navigation controls
      map.current.addControl(
        new mapboxgl.NavigationControl({
          visualizePitch: true,
        }),
        'top-right'
      );

      // Add atmosphere and fog effects
      map.current.on('style.load', () => {
        map.current?.setFog({
          color: 'rgb(255, 255, 255)',
          'high-color': 'rgb(200, 200, 225)',
          'horizon-blend': 0.2,
        });
      });
    }

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    // Add markers for countries with data
    countryData.forEach((country) => {
      const coordinates = countryCoordinates[country.country];
      if (coordinates && map.current) {
        // Calculate marker size based on percentage
        const size = Math.max(20, Math.min(60, country.percentage * 2));
        const opacity = Math.max(0.6, country.percentage / 100);

        // Create marker element
        const markerElement = document.createElement('div');
        markerElement.className = 'analytics-marker';
        markerElement.style.cssText = `
          width: ${size}px;
          height: ${size}px;
          background-color: hsl(var(--primary));
          border: 2px solid hsl(var(--background));
          border-radius: 50%;
          opacity: ${opacity};
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: hsl(var(--primary-foreground));
          font-size: ${Math.max(8, size / 4)}px;
          font-weight: bold;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          transition: all 0.2s ease;
        `;
        markerElement.textContent = country.count.toString();

        // Add hover effect
        markerElement.addEventListener('mouseenter', () => {
          markerElement.style.transform = 'scale(1.2)';
          markerElement.style.zIndex = '1000';
        });
        markerElement.addEventListener('mouseleave', () => {
          markerElement.style.transform = 'scale(1)';
          markerElement.style.zIndex = '1';
        });

        // Create popup
        const popup = new mapboxgl.Popup({
          offset: 25,
          closeButton: false,
          closeOnClick: false,
        }).setHTML(`
          <div style="padding: 8px; min-width: 120px;">
            <div style="font-weight: bold; margin-bottom: 4px;">${country.country}</div>
            <div style="color: hsl(var(--muted-foreground)); font-size: 12px;">
              ${country.count.toLocaleString()} visitors (${country.percentage}%)
            </div>
          </div>
        `);

        // Create marker
        const marker = new mapboxgl.Marker(markerElement)
          .setLngLat(coordinates)
          .setPopup(popup)
          .addTo(map.current);

        markers.current.push(marker);

        // Show popup on hover
        markerElement.addEventListener('mouseenter', () => {
          popup.addTo(map.current!);
        });
        markerElement.addEventListener('mouseleave', () => {
          popup.remove();
        });
      }
    });

    // Cleanup function
    return () => {
      markers.current.forEach(marker => marker.remove());
      markers.current = [];
    };
  }, [countryData, loading, mapboxToken]);

  useEffect(() => {
    // Cleanup map on unmount
    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Geographic Distribution
          </CardTitle>
          <CardDescription>Visitor locations worldwide</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96 bg-muted rounded animate-pulse flex items-center justify-center">
            <div className="text-muted-foreground">Loading map...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Geographic Distribution
        </CardTitle>
        <CardDescription>
          Visitor locations worldwide • Hover over markers for details
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div ref={mapContainer} className="h-96 rounded-lg overflow-hidden border" />
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <div>Showing top {countryData.length} countries</div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary/60"></div>
              <span>Low traffic</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-primary"></div>
              <span>High traffic</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};