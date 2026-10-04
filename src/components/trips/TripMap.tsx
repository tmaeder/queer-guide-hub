import { useEffect, useRef, useMemo, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Maximize2 } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fetchTripMapVenues, fetchTripMapEvents } from '@/hooks/useTripSuggestions';
import { Button } from '@/components/ui/button';
import { getMapStyle } from '@/config/mapStyle';
import { isWebglSupported } from '@/lib/webglSupport';
import { cn } from '@/lib/utils';
import type { TripPlace, TripDay } from '@/hooks/useTrips';
import { useVisitedPlaceLookup } from '@/hooks/useVisitedPlaceLookup';
import { qk } from '@/lib/queryKeys';

/**
 * `dayColor()` IS DELETED. Days are not coloured.
 *
 * It was `hsl((330 + i*47) % 360, 70%, 52%)` — the only raw-HSL palette on any
 * map in this codebase, drifting from the design system by construction, and
 * **encoding day identity by HUE ALONE, which fails WCAG 1.4.1 as written**.
 *
 * The four track colours cannot replace it: tracks are IDENTITY (M venues,
 * E events, C community, T travel) and they are already on this canvas
 * colouring the pins, so "day 2" in track blue would be the same hue as every
 * event pin on the map.
 *
 * The replacement needs no palette at all, because the day FILTER already
 * exists — so emphasis replaces enumeration:
 *
 *   - every day's line draws `ink(0.55)`;
 *   - with a day selected, that day draws full `ink()` and the others
 *     `ink(0.15)`;
 *   - every station carries its STOP NUMBER, which is non-negotiable and is
 *     what satisfies 1.4.1 — the number is the cue, not the colour;
 *   - the chip reads "Day 2".
 *
 * If a per-day hue ever becomes a hard product requirement, cycle the four
 * tracks AND vary `line-dasharray` every four days, so days 1 and 5 differ by
 * dash rather than by nothing. Hue is never the only cue either way, and the
 * stop number stays.
 */
/**
 * TWO weights, not three, and the reason is that the day filter already
 * removes the other days entirely.
 *
 * The obvious design is rest / selected / muted — and `geoPlaces` is filtered
 * by `dayFilter` BEFORE `placesByDay` is built, so with a day selected no
 * other day's line exists to mute. A `DAY_LINE_MUTED` constant would be a dead
 * branch that reads as working emphasis. If the filter ever becomes a
 * highlight rather than a filter, that third weight is what to add.
 */
const DAY_LINE_REST = 0.55;
const DAY_LINE_SELECTED = 1;

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
      <span className="text-muted-foreground">{subtitle}</span>
      {category && (
        <>
          <br />
          <span style={{ fontSize: 11 }} className="text-muted-foreground">
            {category}
          </span>
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
  const visitedLookup = useVisitedPlaceLookup();

  const sortedDays = useMemo(() => [...days].sort((a, b) => a.date.localeCompare(b.date)), [days]);

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
    () => places.some((p) => p.latitude != null && p.longitude != null && !p.day_id),
    [places],
  );

  const cityIds = useMemo(
    () => Array.from(new Set(places.map((p) => p.city_id).filter((id): id is string => !!id))),
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
    queryKey: qk.trip.mapSuggestions('venues', cityIds),
    queryFn: () => fetchTripMapVenues<SuggestedVenue>(cityIds),
    enabled: cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const { data: suggestedEvents = [] } = useQuery({
    queryKey: qk.trip.mapSuggestions('events', [cityIds, startDate, endDate]),
    queryFn: () => fetchTripMapEvents<SuggestedEvent>(cityIds, startDate, endDate),
    enabled: cityIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const visibleVenues = useMemo(
    () =>
      showAttractions
        ? suggestedVenues.filter(
            (v) => !existingVenueIds.has(v.id) && v.latitude != null && v.longitude != null,
          )
        : [],
    [showAttractions, suggestedVenues, existingVenueIds],
  );

  const visibleEvents = useMemo(
    () =>
      showEvents
        ? suggestedEvents.filter(
            (e) => !existingEventIds.has(e.id) && e.latitude != null && e.longitude != null,
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

  // Recreated when the theme flips so the basemap flavor follows it.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!isWebglSupported()) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
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

    const existingSources = Object.keys(map.getStyle()?.sources || {}).filter((s) =>
      s.startsWith('route-day-'),
    );
    for (const src of existingSources) {
      if (map.getLayer(`${src}-line`)) map.removeLayer(`${src}-line`);
      if (map.getSource(src)) map.removeSource(src);
    }

    const placesByDay = new Map<string, TripPlace[]>();

    const disabledColor = 'hsl(var(--muted-foreground))';
    const paperColor = 'hsl(var(--background))';
    const inkColor = 'hsl(var(--foreground))';

    // Stop numbers, per DAY, in the order the places already sort. The number
    // is the cue that replaces the deleted hue — see the `dayColor` note.
    const stopNumber = new Map<string, number>();
    {
      const perDay = new Map<string, number>();
      for (const place of geoPlaces) {
        const key = place.day_id ?? 'unassigned';
        const n = (perDay.get(key) ?? 0) + 1;
        perDay.set(key, n);
        stopNumber.set(place.id, n);
      }
    }

    geoPlaces.forEach((place) => {
      const dayIdx = place.day_id ? dayIndexMap.get(place.day_id) : undefined;
      const color = dayIdx != null ? inkColor : disabledColor;

      const placeName =
        place.venues?.name ||
        place.events?.title ||
        place.hotels?.name ||
        place.custom_name ||
        'Place';
      const dayLabel =
        dayIdx != null
          ? t('trips.map.dayLabel', { number: dayIdx + 1 })
          : t('trips.itinerary.unassigned');

      const visited =
        (place.venue_id && visitedLookup.has('venue', place.venue_id)) ||
        (place.event_id && visitedLookup.has('event', place.event_id));

      // A numbered station, not a coloured dot. 18px so a two-digit number
      // still fits; the ink ring is what makes it legible on any basemap.
      const el = document.createElement('div');
      el.style.width = '18px';
      el.style.height = '18px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = color;
      el.style.border = `2px solid ${paperColor}`;
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.font = '700 10px/1 system-ui, sans-serif';
      el.style.color = paperColor;
      el.textContent = String(stopNumber.get(place.id) ?? '');
      if (visited) {
        el.style.opacity = '0.3';
        el.title = '✓ Visited';
      }

      const popupEl = document.createElement('div');
      const root = createRoot(popupEl);
      root.render(<PopupContent name={placeName} subtitle={dayLabel} category={place.category} />);

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
      el.style.opacity = visitedLookup.has('venue', venue.id) ? '0.3' : '0.85';
      el.style.border = `1px solid ${paperColor}`;
      el.style.cursor = 'pointer';
      if (visitedLookup.has('venue', venue.id)) el.title = '✓ Visited';

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
      el.style.opacity = visitedLookup.has('event', event.id) ? '0.3' : '0.9';
      el.style.border = `1px solid ${paperColor}`;
      el.style.cursor = 'pointer';
      if (visitedLookup.has('event', event.id)) el.title = '✓ Visited';

      const dateLabel = event.start_date
        ? t('trips.map.eventOn', {
            date: format(new Date(event.start_date), 'MMM d'),
          })
        : t('trips.map.showEvents');

      const popupEl = document.createElement('div');
      createRoot(popupEl).render(
        <PopupContent name={event.title} subtitle={dateLabel} category={event.event_type} />,
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
        const color = dayIdx != null ? inkColor : disabledColor;
        // Emphasis, never enumeration. With nothing selected every day draws
        // at the same weight and the STOP NUMBERS are what tell them apart;
        // selecting a day both filters the others out and draws this one at
        // full ink.
        const opacity = dayFilter == null ? DAY_LINE_REST : DAY_LINE_SELECTED;
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
            paint: {
              'line-color': color,
              'line-width': 2,
              'line-opacity': opacity,
              'line-dasharray': [2, 4],
            },
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
  }, [geoPlaces, dayIndexMap, days, t, visibleVenues, visibleEvents, visitedLookup]);

  if (places.length === 0 && cityIds.length === 0) {
    return (
      <div className="h-full w-full min-h-[300px] rounded-element overflow-hidden flex items-center justify-center bg-muted">
        <p className="text-muted-foreground">{t('trips.map.emptyNoPlaces')}</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-element overflow-hidden relative h-[calc(100dvh-360px)] md:h-[calc(100dvh-320px)] min-h-[360px] md:min-h-[520px]">
      {/* Day filter + layer toggle chips */}
      <div
        role="group"
        aria-label="Map day and layer filters"
        tabIndex={0}
        className="absolute top-3 left-3 right-24 z-[2] flex gap-1.5 overflow-x-auto pb-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                // Ink, not a per-day hue. The chip's LABEL ("Day 2") is the
                // cue; a swatch that differs only by hue would re-introduce
                // exactly the 1.4.1 failure `dayColor` was deleted for.
                color="hsl(var(--foreground))"
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

      <div ref={containerRef} key={places.length} style={{ width: '100%', height: '100%' }} />

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
