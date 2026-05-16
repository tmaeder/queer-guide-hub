import { useMemo, useState } from 'react';
import { format, differenceInCalendarDays, isSameDay } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Check, ChevronDown, ChevronUp, MapPin, Sun, Sunrise, Sunset, Moon } from 'lucide-react';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TripDay, TripPlace } from '@/hooks/useTrips';
import { SortablePlaceCard } from './SortablePlaceCard';
import { TripMap } from './TripMap';

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
    .map((p) =>
      [p.events?.title, p.venues?.name, p.custom_name].filter(Boolean).join(' '),
    )
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

interface WeatherPlaceholder {
  inWindow: boolean;
}

function useWeatherStub(date: string): WeatherPlaceholder {
  // TODO: wire to a weather provider. Show placeholder when date is within 14d.
  const target = new Date(date);
  const diff = differenceInCalendarDays(target, new Date());
  return { inWindow: diff >= 0 && diff <= 14 };
}

export function DayCard({
  day,
  dayNumber,
  totalDays: _totalDays,
  isFirst,
  isLast,
  isToday,
  isPast,
  isFuture: _isFuture,
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
}: DayCardProps) {
  const { t } = useTranslation();
  const [mapOpen, setMapOpen] = useState(false);
  const weather = useWeatherStub(day.date);

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

  const theme = useMemo(
    () => autoTheme({ isFirst, isLast, places }),
    [isFirst, isLast, places],
  );

  const dimClass = isPast ? 'opacity-60' : '';
  const cardBorder = isToday ? 'border-foreground' : 'border-border/70';

  return (
    <Card
      data-day-id={day.id}
      data-day-today={isToday ? 'true' : undefined}
      className={`mb-3 rounded-container overflow-hidden border ${cardBorder} ${dimClass}`}
    >
      <CardContent>
        {/* Header */}
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className="flex flex-col items-center justify-center flex-shrink-0 w-14 h-14 rounded-element"
              style={{
                backgroundColor: 'hsl(var(--foreground))',
                color: 'hsl(var(--background))',
              }}
              aria-hidden="true"
            >
              <span
                className="text-[9px] font-semibold uppercase opacity-70"
                style={{ letterSpacing: '0.18em', lineHeight: 1 }}
              >
                {t('trips.itinerary.dayShort')}
              </span>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                }}
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
                  <Badge variant="default" className="rounded-full text-[10px]">
                    {t('trips.timeline.today', 'Today')}
                  </Badge>
                )}
                {weather.inWindow && (
                  <span className="text-xs text-muted-foreground">
                    {t('trips.timeline.weatherTbd', 'Weather —')}
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
                    <Check style={{ width: 14, height: 14 }} />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 min-w-0">
                  {(day.title || theme) && (
                    <p className="text-sm text-muted-foreground truncate max-w-[280px]">
                      {day.title || theme}
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 opacity-40 hover:opacity-100"
                    onClick={onStartEditTitle}
                    aria-label={t('trips.itinerary.editDayTitle')}
                  >
                    <Pencil style={{ width: 12, height: 12 }} />
                  </Button>
                </div>
              )}
            </div>

            <Badge variant="outline" className="rounded-full">
              {t('trips.card.placeCount', { count: places.length })}
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMapOpen((v) => !v)}
              className="rounded-full"
              aria-label={t('trips.timeline.toggleMap', 'Toggle day map')}
              aria-expanded={mapOpen}
            >
              <MapPin style={{ width: 14, height: 14, marginRight: 4 }} />
              {mapOpen ? (
                <ChevronUp style={{ width: 14, height: 14 }} />
              ) : (
                <ChevronDown style={{ width: 14, height: 14 }} />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddPlace()}
              className="rounded-full"
            >
              <Plus style={{ width: 14, height: 14, marginRight: 4 }} />
              {t('trips.itinerary.add')}
            </Button>
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
        <SortableContext
          items={places.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          {places.length === 0 ? (
            <div
              className="border border-dashed rounded-container py-6 text-center min-h-[56px] transition-colors bg-muted/20"
              style={{
                borderColor: activeDragId
                  ? 'hsl(var(--foreground))'
                  : 'hsl(var(--border))',
              }}
            >
              <p className="text-xs text-muted-foreground">
                {t('trips.itinerary.dropHere')}
              </p>
            </div>
          ) : (
            SLOT_ORDER.map((slot) => {
              const slotPlaces = placesBySlot[slot];
              if (slotPlaces.length === 0) return null;
              const Icon = SLOT_ICONS[slot];
              return (
                <div key={slot} className="mb-2 last:mb-0">
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      <Icon style={{ width: 11, height: 11 }} aria-hidden />
                      {t(`trips.timeline.slot.${slot}`, defaultSlotLabel(slot))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onAddPlace(slot)}
                      className="h-6 px-2 text-[11px] opacity-60 hover:opacity-100"
                      aria-label={t('trips.timeline.addToSlot', 'Add to {{slot}}', {
                        slot,
                      })}
                    >
                      <Plus style={{ width: 11, height: 11 }} />
                    </Button>
                  </div>
                  {slotPlaces.map((place) => (
                    <SortablePlaceCard
                      key={place.id}
                      place={place}
                      onDelete={onDeletePlace}
                      tripStartDate={tripStartDate}
                      tripEndDate={tripEndDate}
                    />
                  ))}
                </div>
              );
            })
          )}
        </SortableContext>
      </CardContent>
    </Card>
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

/** Suppress unused-import warning when totalDays/isFuture not consumed inside. */
void (0 as unknown as typeof DayCard);
