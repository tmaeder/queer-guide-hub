import { useEffect, useRef, useMemo, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Maximize2 } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
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
  subtitle: string;
  category: string | null;
}

function PopupContent({ name, subtitle, category }: PopupContentProps) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.4 }}>
      <strong>{name}</strong>
      <br />
      <span style={{ color: '#666' }}>{subtitle}</span>
      {category && (
        <>
          <br />
          <span style={{ fontSize: 11, color: '#999' }}>{category}</span>
        </>
      )}
    </div>
  );
}

interface SuggestedVenue {
  id: string;
  name: string;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface SuggestedEvent {
  id: string;
  title: string;
  event_type: string | null;
  start_date: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface Props {
  places: TripPlace[];
  days: TripDay[];
  startDate?: string;
  endDate?: string;
}

export function TripMap({ places, days, startDate, endDate }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Day filter: null = all, dayId = only that day, 'unassigned' = only unassigned
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [showAttractions, setShowAttractions] = useState(true);
  const [showEvents, setShowEvents] = useState(true);

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

  // Derive destination city_ids from the user's places — this is how we know
  // "where the trip goes" without a dedicated destination column on `trips`.
  const cityIds = useMemo(
    () =>
      Array.from(
        new Set(
          places.map((p) => p.city_id).filter((id): id is string => !!id),
        ),
      ),
    [places],
  );

  // Exclude venues/events already added to the trip so we don't stack markers.
  const existingVenueIds = useMemo(
    () => new Set(places.map((p) => p.venue_id).filter(Boolean)),
    [places],
  );
  const existingEventIds = useMemo(
    () => new Set(places.map((p) => p.event_id).filter(Boolean)),
    [places],
  );

  const { data: suggestedVenues = [] } = useQuery({
    queryKey: ['trip-map-venues', cityIds],
    queryFn: async () => {
      if (cityIds.length === 0) return [] as SuggestedVenue[];
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, category, latitude, longitude')
        .in('city_id', cityIds)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('foursquare_rating', { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as SuggestedVenue[];
    },
    enabled: cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const { data: suggestedEvents = [] } = useQuery({
    queryKey: ['trip-map-events', cityIds, startDate, endDate],
    queryFn: async () => {
      if (cityIds.length === 0) return [] as SuggestedEvent[];
      let query = supabase
        .from('events')
        .select('id, title, event_type, start_date, latitude, longitude')
        .in('city_id', cityIds)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      if (startDate) query = query.gte('start_date', startDate);
      if (endDate) query = query.lte('start_date', endDate);
      const { data, error } = await query
        .order('start_date', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data || []) as SuggestedEvent[];
    },
    enabled: cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const visibleVenues = useMemo(
    () =>
      showAttractions
        ? suggestedVenues.filter(
            (v) =>
              !existingVenueIds.has(v.id) &&
              v.latitude != null &&
              v.longitude != null,
          )
        : [],
    [showAttractions, suggestedVenues, existingVenueIds],
  );

  const visibleEvents = useMemo(
    () =>
      showEvents
        ? suggestedEvents.filter(
            (e) =>
              !existingEventIds.has(e.id) &&
              e.latitude != null &&
              e.longitude != null,
          )
        : [],
    [showEvents, suggestedEvents, existingEventIds],
  );

  const fitBounds = () => {
    if (!mapRef.current) return;
    const bounds = new maplibregl.LngLatBounds();
    let any = false;
    geoPlaces.forEach((p) => {
      bounds.extend([p.longitude!, p.latitude!]);
      any = true;
    });
    visibleVenues.forEach((v) => {
      bounds.extend([v.longitude!, v.latitude!]);
      any = true;
    });
    visibleEvents.forEach((e) => {
      bounds.extend([e.longitude!, e.latitude!]);
      any = true;
    });
    if (any) mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 14 });
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
        <PopupContent name={placeName} subtitle={dayLabel} category={place.category} />,
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

    // Suggested attraction markers: small, neutral, recessive — don't compete
    // with the user's chosen places.
    const attractionColor = theme.palette.mode === 'dark' ? '#a0a0a0' : '#707070';
    visibleVenues.forEach((venue) => {
      const el = document.createElement('div');
      el.style.width = '10px';
      el.style.height = '10px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = attractionColor;
      el.style.opacity = '0.85';
      el.style.border = `1px solid ${theme.palette.background.paper}`;
      el.style.cursor = 'pointer';

      const popupEl = document.createElement('div');
      createRoot(popupEl).render(
        <PopupContent
          name={venue.name}
          subtitle={t('trips.map.suggestedVenue')}
          category={venue.category}
        />,
      );
      const popup = new maplibregl.Popup({ offset: 8, closeButton: false }).setDOMContent(popupEl);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([venue.longitude!, venue.latitude!])
        .setPopup(popup)
        .addTo(map);
      markersRef.current.push(marker);
    });

    // Suggested event markers: square shape + brand accent to distinguish from
    // circular venue markers.
    const eventColor = theme.palette.mode === 'dark' ? '#ff7386' : '#b60d3d';
    visibleEvents.forEach((event) => {
      const el = document.createElement('div');
      el.style.width = '10px';
      el.style.height = '10px';
      el.style.backgroundColor = eventColor;
      el.style.opacity = '0.9';
      el.style.border = `1px solid ${theme.palette.background.paper}`;
      el.style.cursor = 'pointer';
      // Square shape — borderRadius stays 0

      const dateLabel = event.start_date
        ? t('trips.map.eventOn', {
            date: format(new Date(event.start_date), 'MMM d'),
          })
        : t('trips.map.showEvents');

      const popupEl = document.createElement('div');
      createRoot(popupEl).render(
        <PopupContent
          name={event.title}
          subtitle={dateLabel}
          category={event.event_type}
        />,
      );
      const popup = new maplibregl.Popup({ offset: 8, closeButton: false }).setDOMContent(popupEl);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([event.longitude!, event.latitude!])
        .setPopup(popup)
        .addTo(map);
      markersRef.current.push(marker);
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

    if (geoPlaces.length > 0 || visibleVenues.length > 0 || visibleEvents.length > 0) {
      setTimeout(fitBounds, 200);
    }
    // fitBounds is a stable closure over refs; intentionally excluded from deps
    // to avoid re-running the effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoPlaces, dayIndexMap, days, theme, t, visibleVenues, visibleEvents]);

  // If the user hasn't added any places AND we have no destination cities to
  // query, we can't show anything meaningful yet.
  if (places.length === 0 && cityIds.length === 0) {
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
      {/* Day filter + layer toggle chips */}
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
        {sortedDays.length > 0 && (
          <>
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
          </>
        )}
        {cityIds.length > 0 && (
          <>
            <FilterChip
              active={showAttractions}
              onClick={() => setShowAttractions((v) => !v)}
              color={theme.palette.mode === 'dark' ? '#a0a0a0' : '#707070'}
              label={t('trips.map.showAttractions')}
            />
            <FilterChip
              active={showEvents}
              onClick={() => setShowEvents((v) => !v)}
              color={theme.palette.mode === 'dark' ? '#ff7386' : '#b60d3d'}
              label={t('trips.map.showEvents')}
            />
          </>
        )}
      </Box>

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
