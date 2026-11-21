import { tripDateKey } from './tripPhase';
/* eslint-disable react-refresh/only-export-components -- intentionally co-locates helpers/constants with the primary component */

import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
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
  type LucideProps,
} from '@/components/icons';
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
  renderMoveActions?: (place: TripPlace) => React.ReactNode;
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
  renderMoveActions,
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
  const legByFromId = useMemo(() => Object.fromEntries(legs.map((l) => [l.fromId, l])), [legs]);
  const walkingKm = useMemo(() => totalWalkingKm(legs), [legs]);

  const dimClass = isPast ? 'opacity-60' : '';
  const cardBorder = isToday ? 'ring-2 ring-track-pink' : '';

  return (
    <Card
      data-day-id={day.id}
      data-day-today={isToday ? 'true' : undefined}
      className={`group/day mb-4 overflow-hidden sm:mb-6 rounded-container bg-card ${cardBorder} ${dimClass}`}
    >
      <CardContent className="px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
        {/* Header */}
        <div className="mb-2 flex flex-col gap-2 sm:mb-4 lg:flex-row lg:items-center lg:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
            <div
              className={`flex h-12 w-12 flex-shrink-0 flex-col sm:h-14 sm:w-14 items-center justify-center rounded-full border-[3px] transition-transform sm:border-[4px] duration-normal group-hover/day:-rotate-3 group-hover/day:scale-105 ${
                isToday
                  ? 'border-track-ring bg-track-pink text-track-ring'
                  : isPast
                    ? 'border-track-ring bg-foreground text-background'
                    : 'border-foreground bg-background text-foreground'
              }`}
              aria-hidden="true"
            >
              <span
                className="text-3xs font-semibold uppercase opacity-70"
                style={{ letterSpacing: '0.18em', lineHeight: 1 }}
              >
                {t('trips.itinerary.dayShort')}
              </span>
              <span
                style={{ lineHeight: 1.1, letterSpacing: '-0.02em' }}
                className="text-base font-bold sm:text-title"
              >
                {dayNumber}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="break-words text-base font-bold leading-tight tracking-tight sm:text-title">
                  {format(parseISO(day.date), 'EEEE, MMM d')}
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
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-2xs rounded-badge text-foreground bg-surface-container"
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

            {places.length > 0 && (
              <span className="shrink-0 rounded-badge bg-muted px-2 py-1 text-xs font-semibold tabular-nums text-muted-foreground">
                {t('trips.card.placeCount', { count: places.length })}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
              <Button variant="ghost" size="sm" asChild className="rounded-full">
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
              className={`rounded-full bg-muted px-2 sm:px-4 ${mapOpen ? 'bg-foreground text-background hover:bg-foreground/90' : ''}`}
              aria-label={t('trips.timeline.toggleMap', 'Toggle day map')}
              aria-expanded={mapOpen}
            >
              <MapPin size={14} aria-hidden />
              <span className="hidden sm:inline">{t('trips.tabs.map', 'Map')}</span>
              {mapOpen ? (
                <ChevronUp size={14} aria-hidden />
              ) : (
                <ChevronDown size={14} aria-hidden />
              )}
            </Button>
            {!readOnly && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNoteOpen(true)}
                  className="rounded-full bg-muted px-2 sm:px-4"
                  aria-label={t('trips.dayNotes.addTitle', 'Add a note to this day')}
                >
                  <StickyNote size={14} aria-hidden />
                  <span className="hidden sm:inline">{t('trips.dayNotes.textLabel', 'Note')}</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => onAddPlace()}
                  className="ml-auto rounded-full px-4 lg:ml-0"
                >
                  <Plus size={14} aria-hidden />
                  {t('trips.itinerary.addPlace', 'Add place')}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Map peek */}
        {mapOpen && (
          <div className="mb-4 h-[260px] rounded-container overflow-hidden bg-surface-container">
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
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onAddPlace()}
              className={`group/empty flex w-full items-center justify-center gap-2 rounded-container border-2 border-dashed px-4 py-2 sm:flex-col sm:py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default ${
                activeDragId
                  ? 'border-foreground bg-muted'
                  : 'border-border bg-muted/40 hover:border-foreground hover:bg-muted'
              }`}
            >
              {!readOnly && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground sm:h-10 sm:w-10 text-background transition-transform duration-fast group-hover/empty:scale-110">
                  <Plus size={16} aria-hidden />
                </span>
              )}
              <span className="text-sm text-muted-foreground">{t('trips.itinerary.dropHere')}</span>
            </button>
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
                          moveActions={renderMoveActions?.(place)}
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

/**
 * Render the resolved weather icon as an element so no capitalized component
 * variable is created during render (react-hooks/static-components).
 */
function renderWeatherIcon(code: number, props?: LucideProps) {
  const Icon = weatherIconFor(code);
  return <Icon {...props} />;
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
  const label = weatherLabelKeyFor(code);
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      title={t(label.key, label.defaultLabel)}
      data-testid="day-weather"
    >
      {renderWeatherIcon(code, { className: 'w-3.5 h-3.5', 'aria-hidden': true })}
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
  return date === tripDateKey(now);
}
