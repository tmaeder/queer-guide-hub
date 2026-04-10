import { useEffect, useRef, useMemo, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Maximize2 } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { mapStyle } from '@/config/mapStyle';
import type { TripPlace, TripDay } from '@/hooks/useTrips';

function dayColor(index: number): string {
  // Deterministic, brand-adjacent hue rotation. Day 0 is magenta-ish.
  const hue = (330 + index * 47) % 360;
  return `hsl(${hue}, 70%, 52%)`;
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
  const { t } = useTranslation();
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Day filter: null = all, dayId = only that day, 'unassigned' = only unassigned
  const [dayFilter, setDayFilter] = useState<string | null>(null);

  const sortedDays = useMemo(
    () => [...days].sort((a, b) => a.date.localeCompare(b.date)),
    [days],
  );

  const dayIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    sortedDays.forEach((d, i) => map.set(d.id, i));
    return map;
  }, [sortedDays]);

  const geoPlaces = useMemo(
    () =>
      places
        .filter((p) => p.latitude != null && p.longitude != null)
        .filter((p) => {
          if (!dayFilter) return true;
          if (dayFilter === 'unassigned') return !p.day_id;
          return p.day_id === dayFilter;
        }),
    [places, dayFilter],
  );

  const hasUnassignedGeo = useMemo(
    () =>
      places.some(
        (p) => p.latitude != null && p.longitude != null && !p.day_id,
      ),
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
      const color = dayIdx != null ? dayColor(dayIdx) : theme.palette.text.disabled;

      const placeName =
        place.venues?.name || place.events?.title || place.hotels?.name || place.custom_name || 'Place';
      const dayLabel =
        dayIdx != null
          ? t('trips.map.dayLabel', { number: dayIdx + 1 })
          : t('trips.itinerary.unassigned');

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
        const color = dayIdx != null ? dayColor(dayIdx) : theme.palette.text.disabled;
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
    // fitBounds is a stable closure over refs; intentionally excluded from deps
    // to avoid re-running the effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoPlaces, dayIndexMap, days, theme, t]);

  if (places.length === 0) {
    return (
      <Box
        sx={{
          height: '100%',
          width: '100%',
          minHeight: 300,
          borderRadius: 2,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'action.hover',
        }}
      >
        <Typography color="text.secondary">
          {t('trips.map.emptyNoPlaces')}
        </Typography>
      </Box>
    );
  }

  const totalWithCoords = places.filter(
    (p) => p.latitude != null && p.longitude != null,
  ).length;

  if (totalWithCoords === 0) {
    return (
      <Box
        sx={{
          height: '100%',
          width: '100%',
          minHeight: 300,
          borderRadius: 2,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'action.hover',
        }}
      >
        <Typography color="text.secondary">
          {t('trips.map.emptyNoCoords')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        borderRadius: 2,
        overflow: 'hidden',
        position: 'relative',
        height: { xs: 'calc(100dvh - 360px)', md: 'calc(100dvh - 320px)' },
        minHeight: { xs: 360, md: 520 },
      }}
    >
      {/* Day filter chips */}
      {sortedDays.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: 12,
            left: 12,
            right: 96,
            zIndex: 2,
            display: 'flex',
            gap: 0.75,
            overflowX: 'auto',
            pb: 0.5,
            '&::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
          }}
        >
          <FilterChip
            active={dayFilter === null}
            onClick={() => setDayFilter(null)}
            color={theme.palette.text.primary}
            label={t('trips.map.filterAll')}
          />
          {sortedDays.map((day, idx) => (
            <FilterChip
              key={day.id}
              active={dayFilter === day.id}
              onClick={() => setDayFilter(day.id)}
              color={dayColor(idx)}
              label={t('trips.map.dayLabel', { number: idx + 1 })}
            />
          ))}
          {hasUnassignedGeo && (
            <FilterChip
              active={dayFilter === 'unassigned'}
              onClick={() => setDayFilter('unassigned')}
              color={theme.palette.text.disabled as string}
              label={t('trips.itinerary.unassigned')}
            />
          )}
        </Box>
      )}

      <div
        ref={containerRef}
        key={places.length}
        style={{ width: '100%', height: '100%' }}
      />

      {/* Fit-all button */}
      <Box sx={{ position: 'absolute', top: 12, right: 52, zIndex: 2 }}>
        <Button
          variant="outline"
          size="sm"
          onClick={fitBounds}
          style={{
            backgroundColor: theme.palette.background.paper,
            paddingLeft: 10,
            paddingRight: 10,
          }}
          aria-label={t('trips.map.fitAllAria')}
        >
          <Maximize2 size={14} style={{ marginRight: 4 }} />
          {t('trips.map.fitAll')}
        </Button>
      </Box>
    </Box>
  );
}

/** Compact pill filter chip for the day-filter row on the map. */
function FilterChip({
  active,
  onClick,
  color,
  label,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  label: string;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.25,
        py: 0.5,
        borderRadius: 999,
        border: '1px solid',
        borderColor: active ? 'brand.main' : 'divider',
        bgcolor: active ? 'brand.main' : 'background.paper',
        color: active ? 'brand.contrastText' : 'text.primary',
        fontSize: '0.75rem',
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'all 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
        fontFamily: 'inherit',
        '&:hover': {
          borderColor: 'brand.main',
        },
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: color,
          flexShrink: 0,
        }}
      />
      {label}
    </Box>
  );
}
