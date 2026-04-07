import { useEffect, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Maximize2 } from 'lucide-react';
import type { TripPlace, TripDay } from '@/hooks/useTrips';

const DAY_COLORS = [
  '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6',
  '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#a855f7',
];
const UNASSIGNED_COLOR = '#9ca3af';

interface Props {
  places: TripPlace[];
  days: TripDay[];
}

export function TripMap({ places, days }: Props) {
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
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
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

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    geoPlaces.forEach((place) => {
      const dayIdx = place.day_id ? dayIndexMap.get(place.day_id) : undefined;
      const color = dayIdx != null ? DAY_COLORS[dayIdx % DAY_COLORS.length] : UNASSIGNED_COLOR;

      const placeName =
        place.venues?.name || place.events?.title || place.hotels?.name || place.custom_name || 'Place';
      const dayLabel =
        dayIdx != null && days[dayIdx]
          ? `Day ${dayIdx + 1}`
          : 'Unassigned';

      const el = document.createElement('div');
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = color;
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';

      const popup = new maplibregl.Popup({ offset: 10, closeButton: false }).setHTML(
        `<div style="font-size:13px"><strong>${placeName}</strong><br/><span style="color:#666">${dayLabel}</span></div>`,
      );

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([place.longitude!, place.latitude!])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    if (geoPlaces.length > 0) {
      setTimeout(fitBounds, 200);
    }
  }, [geoPlaces, dayIndexMap, days]);

  if (places.length === 0 || geoPlaces.length === 0) {
    return (
      <Box className="h-full w-full rounded-lg overflow-hidden bg-muted flex items-center justify-center">
        <Typography color="text.secondary">
          {places.length === 0
            ? 'Add places to see them on the map.'
            : 'None of your places have coordinates yet.'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box className="h-full w-full rounded-lg overflow-hidden relative">
      <div ref={containerRef} className="h-full w-full" />
      <Button
        size="small"
        variant="contained"
        startIcon={<Maximize2 size={14} />}
        onClick={fitBounds}
        sx={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          bgcolor: 'white',
          color: 'text.primary',
          boxShadow: 2,
          '&:hover': { bgcolor: 'grey.100' },
          textTransform: 'none',
          fontSize: 12,
        }}
      >
        Fit All
      </Button>
    </Box>
  );
}
