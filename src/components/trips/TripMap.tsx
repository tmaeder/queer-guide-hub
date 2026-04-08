import { useEffect, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Maximize2 } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { mapStyle } from '@/config/mapStyle';
import type { TripPlace, TripDay } from '@/hooks/useTrips';

function dayColor(index: number, theme: ReturnType<typeof useTheme>): string {
  const hue = (index * 137.5) % 360;
  return `hsl(${hue}, 65%, 50%)`;
}

interface PopupContentProps {
  name: string;
  dayLabel: string;
  category: string | null;
}

function PopupContent({ name, dayLabel, category }: PopupContentProps) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.4 }}>
      <strong>{name}</strong>
      <br />
      <span style={{ color: '#666' }}>{dayLabel}</span>
      {category && (
        <>
          <br />
          <span style={{ fontSize: 11, color: '#999' }}>{category}</span>
        </>
      )}
    </div>
  );
}

interface Props {
  places: TripPlace[];
  days: TripDay[];
}

export function TripMap({ places, days }: Props) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const dayIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    days.forEach((d, i) => map.set(d.id, i));
    return map;
  }, [days]);

  const geoPlaces = useMemo(
    () => places.filter((p) => p.latitude != null && p.longitude != null),
    [places],
  );

  const fitBounds = () => {
    if (!mapRef.current || geoPlaces.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    geoPlaces.forEach((p) => bounds.extend([p.longitude!, p.latitude!]));
    mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 14 });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [10, 48],
      zoom: 3,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Remove old route lines
    const existingSources = Object.keys((map.getStyle()?.sources) || {}).filter((s) => s.startsWith('route-day-'));
    for (const src of existingSources) {
      if (map.getLayer(`${src}-line`)) map.removeLayer(`${src}-line`);
      if (map.getSource(src)) map.removeSource(src);
    }

    // Group places by day for route lines
    const placesByDay = new Map<string, TripPlace[]>();

    geoPlaces.forEach((place) => {
      const dayIdx = place.day_id ? dayIndexMap.get(place.day_id) : undefined;
      const color = dayIdx != null ? dayColor(dayIdx, theme) : theme.palette.text.disabled;

      const placeName =
        place.venues?.name || place.events?.title || place.hotels?.name || place.custom_name || 'Place';
      const dayLabel = dayIdx != null && days[dayIdx] ? `Day ${dayIdx + 1}` : 'Unassigned';

      // Create marker element
      const el = document.createElement('div');
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = color;
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';

      // React-rendered popup
      const popupEl = document.createElement('div');
      const root = createRoot(popupEl);
      root.render(
        <PopupContent name={placeName} dayLabel={dayLabel} category={place.category} />,
      );

      const popup = new maplibregl.Popup({ offset: 10, closeButton: false }).setDOMContent(popupEl);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([place.longitude!, place.latitude!])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);

      // Collect for route lines
      if (place.day_id) {
        if (!placesByDay.has(place.day_id)) placesByDay.set(place.day_id, []);
        placesByDay.get(place.day_id)!.push(place);
      }
    });

    // Add route lines between same-day places
    const addRoutes = () => {
      placesByDay.forEach((dayPlaces, dayId) => {
        if (dayPlaces.length < 2) return;
        const dayIdx = dayIndexMap.get(dayId);
        const color = dayIdx != null ? dayColor(dayIdx, theme) : theme.palette.text.disabled;
        const sourceId = `route-day-${dayId}`;

        const coordinates = dayPlaces.map((p) => [p.longitude!, p.latitude!]);

        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates },
            },
          });
          map.addLayer({
            id: `${sourceId}-line`,
            type: 'line',
            source: sourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.6, 'line-dasharray': [2, 4] },
          });
        }
      });
    };

    if (map.isStyleLoaded()) {
      addRoutes();
    } else {
      map.once('style.load', addRoutes);
    }

    if (geoPlaces.length > 0) {
      setTimeout(fitBounds, 200);
    }
  }, [geoPlaces, dayIndexMap, days, theme]);

  if (places.length === 0 || geoPlaces.length === 0) {
    return (
      <Box className="h-full w-full rounded-lg overflow-hidden flex items-center justify-center" sx={{ bgcolor: 'action.hover', minHeight: 300 }}>
        <Typography color="text.secondary">
          {places.length === 0
            ? 'Add places to see them on the map'
            : 'None of your places have coordinates yet'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box className="h-full w-full rounded-lg overflow-hidden relative" sx={{ minHeight: 400 }}>
      <div ref={containerRef} key={places.length} style={{ width: '100%', height: '100%' }} />
      <Box sx={{ position: 'absolute', top: 12, right: 52 }}>
        <Button variant="ghost" size="sm" onClick={fitBounds}>
          <Maximize2 size={14} />
          Fit All
        </Button>
      </Box>
    </Box>
  );
}
