/* eslint-disable react-refresh/only-export-components -- intentionally co-locates helpers/constants with the primary component */

import { useMemo, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Pencil,
  Check,
  ChevronDown,
  ChevronUp,
  MapPin,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  StickyNote,
  AlertTriangle,
  Footprints,
  Route,
  ExternalLink,
} from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TripDay, TripPlace } from '@/hooks/useTrips';
import { useDayWeather, type Coord } from '@/hooks/useDayWeather';
import { weatherIconFor, weatherLabelKeyFor } from '@/lib/weather/openMeteo';
import type { TripConflict } from './tripConflicts';
import {
  buildLegs,
  totalWalkingKm,
  formatLegDistance,
  optimizeDayOrder,
  googleMapsDayUrl,
} from './tripLegs';
import { useTripMutations } from '@/hooks/useTrips';
import { LegRow } from './LegRow';
import { SortablePlaceCard } from './SortablePlaceCard';
import { DayNoteRow } from './DayNoteRow';
import { AddDayNoteDialog } from './AddDayNoteDialog';
import { TripMap } from './TripMapLazy';

export type DaySlot = 'morning' | 'afternoon' | 'evening' | 'night' | 'unscheduled';

export interface DayCardProps {
  day: TripDay;
  dayNumber: number;
  totalDays: number;
  isFirst: boolean;
  isLast: boolean;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  places: TripPlace[];
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  editingTitle: boolean;
  draftTitle: string;
  activeDragId: string | null;
  onStartEditTitle: () => void;
  onChangeDraftTitle: (v: string) => void;
  onSaveTitle: () => void;
  onCancelEditTitle: () => void;
  onAddPlace: (slot?: DaySlot) => void;
  onDeletePlace: (placeId: string) => void;
  /** Conflicts detected for this day (time overlaps, double lodging). */
  conflicts?: TripConflict[];
  /** Coordinate to use for weather when no place on this day has one. */
  fallbackCoord?: Coord | null;
  /** Viewer role: hide edit affordances. RLS enforces server-side. */
  readOnly?: boolean;
}

/**
 * Returns the time-of-day slot for a place based on `start_time`.
 * No start_time → "unscheduled".
 */
export function getPlaceSlot(place: TripPlace): DaySlot {
  if (!place.start_time) return 'unscheduled';
  const hour = parseInt(place.start_time.slice(0, 2), 10);
  if (Number.isNaN(hour)) return 'unscheduled';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

const SLOT_ORDER: DaySlot[] = ['morning', 'afternoon', 'evening', 'night', 'unscheduled'];

const SLOT_ICONS: Record<DaySlot, typeof Sun> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  night: Moon,
  unscheduled: MapPin,
};

/**
 * Best-effort auto theme. Pure heuristic — no LLM, no copy violations.
 * Returns null if nothing distinctive to say.
 */
export function autoTheme(args: {
  isFirst: boolean;
  isLast: boolean;
  places: TripPlace[];
}): string | null {
  const { isFirst, isLast, places } = args;
  const titles = places
    .map((p) => [p.events?.title, p.venues?.name, p.custom_name].filter(Boolean).join(' '))
    .join(' ')
    .toLowerCase();

  if (/pride|csd|christopher street day/.test(titles)) return 'Pride day';
  if (places.some((p) => p.event_id) && places.length === 1) {
    const ev = places[0].events?.title;
    if (ev) return ev;
  }
  if (isFirst) return 'Arrival day';
  if (isLast) return 'Departure day';
  return null;
}

function coordForDay(places: TripPlace[], fallback?: Coord | null): Coord | null {
  const withCoords = places.find((p) => p.latitude != null && p.longitude != null);
  if (withCoords) return { lat: withCoords.latitude!, lng: withCoords.longitude! };
  return fallback ?? null;
}

export function DayCard({
  day,
  dayNumber,
  isFirst,
  isLast,
  isToday,
  isPast,
  places,
  tripStartDate,
  tripEndDate,
  editingTitle,
  draftTitle,
  activeDragId,
  onStartEditTitle,
  onChangeDraftTitle,
  onSaveTitle,
  onCancelEditTitle,
  onAddPlace,
  onDeletePlace,
  conflicts = [],
  fallbackCoord,
  readOnly = false,
}: DayCardProps) {
  const { t } = useTranslation();
  const [mapOpen, setMapOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const { updatePlace } = useTripMutations();
  const coord = useMemo(() => coordForDay(places, fallbackCoord), [places, fallbackCoord]);
  const weather = useDayWeather(day.date, coord);

  const locatedCount = useMemo(
    () =>
      places.filter((p) => p.latitude != null && p.longitude != null && p.category !== 'note')
        .length,
    [places],
  );
  const directionsUrl = useMemo(() => googleMapsDayUrl(places), [places]);

  const optimizeRoute = () => {
    const optimized = optimizeDayOrder([...places].sort((a, b) => a.sort_order - b.sort_order));
    optimized.forEach((place, idx) => {
      if (place.sort_order !== idx) {
        updatePlace.mutate({ id: place.id, trip_id: day.trip_id, sort_order: idx });
      }
    });
  };

  const placesBySlot = useMemo(() => {
    const map: Record<DaySlot, TripPlace[]> = {
      morning: [],
      afternoon: [],
      evening: [],
      night: [],
      unscheduled: [],
    };
    for (const p of places) map[getPlaceSlot(p)].push(p);
    return map;
  }, [places]);

  const theme = useMemo(() => autoTheme({ isFirst, isLast, places }), [isFirst, isLast, places]);

  // Route legs between consecutive places, following visual (slot) order.
  const legs = useMemo(() => {
    const visualOrder = SLOT_ORDER.flatMap((slot) => placesBySlot[slot]);
    return buildLegs(visualOrder);
  }, [placesBySlot]);
  const legByFromId = useMemo(
    () => Object.fromEntries(legs.map((l) => [l.fromId, l])),
    [legs],
  );
  const walkingKm = useMemo(() => totalWalkingKm(legs), [legs]);

  const dimClass = isPast ? 'opacity-60' : '';
  const cardBorder = isToday ? 'border-foreground' : 'border-border/70';

  return (
    <Card
      data-day-id={day.id}
      data-day-today={isToday ? 'true' : undefined}
      className={`mb-4 rounded-container overflow-hidden border ${cardBorder} ${dimClass}`}
    >
      <CardContent>
        {/* Header */}
        <div className="flex items-center justify-between mb-4 gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div
              className="flex flex-col items-center justify-center flex-shrink-0 w-14 h-14 rounded-element text-background"
              style={{ backgroundColor: 'hsl(var(--foreground))' }}
              aria-hidden="true"
            >
              <span
                className="text-3xs font-semibold uppercase opacity-70"
                style={{ letterSpacing: '0.18em', lineHeight: 1 }}
              >
                {t('trips.itinerary.dayShort')}
              </span>
              <span
                style={{ fontSize: 22, lineHeight: 1.1, letterSpacing: '-0.02em' }}
                className="font-bold"
              >
                {dayNumber}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold leading-tight tracking-tight">
                  {format(new Date(day.date), 'EEEE, MMM d')}
                </p>
                {isToday && (
                  <Badge variant="default" className="rounded-full text-2xs">
                    {t('trips.timeline.today', 'Today')}
                  </Badge>
                )}
                {weather && (
                  <WeatherChip
                    code={weather.code}
                    tMinC={weather.tMinC}
                    tMaxC={weather.tMaxC}
                    typical={weather.source === 'typical'}
                  />
                )}
                {conflicts.length > 0 && (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-2xs rounded-badge border border-foreground/40 text-foreground"
                    title={conflicts.map((c) => c.message).join('\n')}
                    data-testid="day-conflict-chip"
                  >
                    <AlertTriangle className="w-3 h-3" aria-hidden />
                    {t('trips.conflicts.chip', '{{count}} conflicts', {
                      count: conflicts.length,
                    })}
                  </span>
                )}
              </div>

              {editingTitle ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <Input
                    value={draftTitle}
                    onChange={(e) => onChangeDraftTitle(e.target.value)}
                    placeholder={t('trips.itinerary.dayTitlePlaceholder')}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSaveTitle();
                      if (e.key === 'Escape') onCancelEditTitle();
                    }}
                    className="flex-1 max-w-[240px] h-8"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={onSaveTitle}
                    aria-label={t('trips.itinerary.saveDayTitle')}
                  >
                    <Check size={14} />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 min-w-0">
                  {(day.title || theme) && (
                    <p className="text-sm text-muted-foreground truncate max-w-[280px]">
                      {day.title || theme}
                    </p>
                  )}
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-40 hover:opacity-100"
                      onClick={onStartEditTitle}
                      aria-label={t('trips.itinerary.editDayTitle')}
                    >
                      <Pencil size={12} />
                    </Button>
                  )}
                </div>
              )}
            </div>

            <Badge variant="outline" className="rounded-full">
              {t('trips.card.placeCount', { count: places.length })}
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            {!readOnly && locatedCount >= 3 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={optimizeRoute}
                className="rounded-full"
                aria-label={t('trips.legs.optimize', 'Optimize route order')}
                title={t('trips.legs.optimize', 'Optimize route order')}
              >
                <Route size={14} />
              </Button>
            )}
            {directionsUrl && (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="rounded-full"
              >
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('trips.legs.directions', 'Open day in Google Maps')}
                  title={t('trips.legs.directions', 'Open day in Google Maps')}
                >
                  <ExternalLink size={14} />
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMapOpen((v) => !v)}
              className="rounded-full"
              aria-label={t('trips.timeline.toggleMap', 'Toggle day map')}
              aria-expanded={mapOpen}
            >
              <MapPin size={14} className="mr-1" />
              {mapOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </Button>
            {!readOnly && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNoteOpen(true)}
                  className="rounded-full"
                  aria-label={t('trips.dayNotes.addTitle', 'Add a note to this day')}
                >
                  <StickyNote size={14} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onAddPlace()} className="rounded-full">
                  <Plus size={14} className="mr-1" />
                  {t('trips.itinerary.add')}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Map peek */}
        {mapOpen && (
          <div className="mb-4 h-[260px] border border-border rounded-container overflow-hidden">
            <TripMap
              places={places}
              days={[day]}
              startDate={tripStartDate ?? undefined}
              endDate={tripEndDate ?? undefined}
            />
          </div>
        )}

        {/* Time slots */}
        <SortableContext items={places.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {places.length === 0 ? (
            <div
              className="border border-dashed rounded-container py-6 text-center min-h-[56px] transition-colors bg-muted/20"
              style={{
                borderColor: activeDragId ? 'hsl(var(--foreground))' : 'hsl(var(--border))',
              }}
            >
              <p className="text-xs text-muted-foreground">{t('trips.itinerary.dropHere')}</p>
            </div>
          ) : (
            SLOT_ORDER.map((slot) => {
              const slotPlaces = placesBySlot[slot];
              if (slotPlaces.length === 0) return null;
              const Icon = SLOT_ICONS[slot];
              return (
                <div key={slot} className="mb-2 last:mb-0">
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <div className="inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      <Icon style={{ width: 11, height: 11 }} aria-hidden />
                      {t(`trips.timeline.slot.${slot}`, defaultSlotLabel(slot))}
                    </div>
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAddPlace(slot)}
                        className="h-6 px-2 text-xs2 opacity-60 hover:opacity-100"
                        aria-label={t('trips.timeline.addToSlot', 'Add to {{slot}}', {
                          slot,
                        })}
                      >
                        <Plus size={11} />
                      </Button>
                    )}
                  </div>
                  {slotPlaces.map((place) => {
                    const leg = legByFromId[place.id];
                    return place.category === 'note' ? (
                      <DayNoteRow
                        key={place.id}
                        place={place}
                        onDelete={onDeletePlace}
                        readOnly={readOnly}
                      />
                    ) : (
                      <div key={place.id}>
                        <SortablePlaceCard
                          place={place}
                          onDelete={onDeletePlace}
                          tripStartDate={tripStartDate}
                          tripEndDate={tripEndDate}
                          readOnly={readOnly}
                        />
                        {leg && <LegRow leg={leg} readOnly={readOnly} />}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </SortableContext>

        {walkingKm >= 0.5 && (
          <p
            className="mt-2 inline-flex items-center gap-1.5 text-xs2 text-muted-foreground"
            data-testid="day-walking-total"
          >
            <Footprints className="w-3 h-3" aria-hidden />
            {t('trips.legs.walkingTotal', '{{distance}} walking', {
              distance: formatLegDistance(walkingKm),
            })}
          </p>
        )}
      </CardContent>

      {noteOpen && (
        <AddDayNoteDialog
          open={noteOpen}
          onClose={() => setNoteOpen(false)}
          tripId={day.trip_id}
          dayId={day.id}
          nextSortOrder={places.length}
        />
      )}
    </Card>
  );
}

function WeatherChip({
  code,
  tMinC,
  tMaxC,
  typical,
}: {
  code: number;
  tMinC: number;
  tMaxC: number;
  typical: boolean;
}) {
  const { t } = useTranslation();
  const Icon = weatherIconFor(code);
  const label = weatherLabelKeyFor(code);
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      title={t(label.key, label.defaultLabel)}
      data-testid="day-weather"
    >
      <Icon className="w-3.5 h-3.5" aria-hidden />
      <span className="tabular-nums">
        {Math.round(tMinC)}–{Math.round(tMaxC)}°
      </span>
      {typical && (
        <span className="text-2xs uppercase tracking-wide">
          {t('trips.weather.typical', 'typical')}
        </span>
      )}
    </span>
  );
}

function defaultSlotLabel(slot: DaySlot): string {
  switch (slot) {
    case 'morning':
      return 'Morning';
    case 'afternoon':
      return 'Afternoon';
    case 'evening':
      return 'Evening';
    case 'night':
      return 'Night';
    default:
      return 'Anytime';
  }
}

/** Helper exported for testing + use in parent components. */
export function isDayToday(date: string, now: Date = new Date()): boolean {
  return isSameDay(new Date(date), now);
}
