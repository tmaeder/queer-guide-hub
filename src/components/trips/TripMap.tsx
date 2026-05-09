import { useEffect, useRef, useMemo, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Maximize2 } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fetchTripMapVenues, fetchTripMapEvents } from '@/hooks/useTripSuggestions';
import { Button } from '@/components/ui/button';
import { mapStyle } from '@/config/mapStyle';
import { cn } from '@/lib/utils';
import type { TripPlace, TripDay } from '@/hooks/useTrips';

function dayColor(index: number): string {
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
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

  const cityIds = useMemo(
    () =>
      Array.from(
        new Set(
          places.map((p) => p.city_id).filter((id): id is string => !!id),
        ),
      ),
    [places],
  );

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
    queryFn: () => fetchTripMapVenues<SuggestedVenue>(cityIds),
    enabled: cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const { data: suggestedEvents = [] } = useQuery({
    queryKey: ['trip-map-events', cityIds, startDate, endDate],
    queryFn: () => fetchTripMapEvents<SuggestedEvent>(cityIds, startDate, endDate),
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

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const existingSources = Object.keys((map.getStyle()?.sources) || {}).filter((s) => s.startsWith('route-day-'));
    for (const src of existingSources) {
      if (map.getLayer(`${src}-line`)) map.removeLayer(`${src}-line`);
      if (map.getSource(src)) map.removeSource(src);
    }

    const placesByDay = new Map<string, TripPlace[]>();

    const disabledColor = 'hsl(var(--muted-foreground))';
    const paperColor = 'hsl(var(--background))';

    geoPlaces.forEach((place) => {
      const dayIdx = place.day_id ? dayIndexMap.get(place.day_id) : undefined;
      const color = dayIdx != null ? dayColor(dayIdx) : disabledColor;

      const placeName =
        place.venues?.name || place.events?.title || place.hotels?.name || place.custom_name || 'Place';
      const dayLabel =
        dayIdx != null
          ? t('trips.map.dayLabel', { number: dayIdx + 1 })
          : t('trips.itinerary.unassigned');

      const el = document.createElement('div');
      el.style.width = '14px';
      el.style.height = '14px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = color;
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';

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

      if (place.day_id) {
        if (!placesByDay.has(place.day_id)) placesByDay.set(place.day_id, []);
        placesByDay.get(place.day_id)!.push(place);
      }
    });

    const attractionColor = '#707070';
    visibleVenues.forEach((venue) => {
      const el = document.createElement('div');
      el.style.width = '10px';
      el.style.height = '10px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = attractionColor;
      el.style.opacity = '0.85';
      el.style.border = `1px solid ${paperColor}`;
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

    const eventColor = 'hsl(var(--foreground))';
    visibleEvents.forEach((event) => {
      const el = document.createElement('div');
      el.style.width = '10px';
      el.style.height = '10px';
      el.style.backgroundColor = eventColor;
      el.style.opacity = '0.9';
      el.style.border = `1px solid ${paperColor}`;
      el.style.cursor = 'pointer';

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

    const addRoutes = () => {
      placesByDay.forEach((dayPlaces, dayId) => {
        if (dayPlaces.length < 2) return;
        const dayIdx = dayIndexMap.get(dayId);
        const color = dayIdx != null ? dayColor(dayIdx) : disabledColor;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoPlaces, dayIndexMap, days, t, visibleVenues, visibleEvents]);

  if (places.length === 0 && cityIds.length === 0) {
    return (
      <div className="h-full w-full min-h-[300px] rounded-lg overflow-hidden flex items-center justify-center bg-muted">
        <p className="text-muted-foreground">{t('trips.map.emptyNoPlaces')}</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg overflow-hidden relative h-[calc(100dvh-360px)] md:h-[calc(100dvh-320px)] min-h-[360px] md:min-h-[520px]">
      {/* Day filter + layer toggle chips */}
      <div
        className="absolute top-3 left-3 right-24 z-[2] flex gap-1.5 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none' }}
      >
        {sortedDays.length > 0 && (
          <>
            <FilterChip
              active={dayFilter === null}
              onClick={() => setDayFilter(null)}
              color="hsl(var(--foreground))"
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
                color="hsl(var(--muted-foreground))"
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
              color="#707070"
              label={t('trips.map.showAttractions')}
            />
            <FilterChip
              active={showEvents}
              onClick={() => setShowEvents((v) => !v)}
              color="hsl(var(--foreground))"
              label={t('trips.map.showEvents')}
            />
          </>
        )}
      </div>

      <div
        ref={containerRef}
        key={places.length}
        style={{ width: '100%', height: '100%' }}
      />

      {/* Fit-all button */}
      <div className="absolute top-3 right-[52px] z-[2]">
        <Button
          variant="outline"
          size="sm"
          onClick={fitBounds}
          className="bg-background px-2.5"
          aria-label={t('trips.map.fitAllAria')}
        >
          <Maximize2 size={14} className="mr-1" />
          {t('trips.map.fitAll')}
        </Button>
      </div>
    </div>
  );
}

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
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer whitespace-nowrap transition-all',
        active ? 'text-white' : 'bg-background text-foreground',
      )}
      style={active ? { backgroundColor: 'hsl(var(--foreground))' } : undefined}
    >
      <span
        className="inline-block rounded-full flex-shrink-0"
        style={{ width: 8, height: 8, backgroundColor: color }}
      />
      {label}
    </button>
  );
}
