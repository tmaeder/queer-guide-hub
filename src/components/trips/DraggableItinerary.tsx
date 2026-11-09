import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import { Plus, Inbox, Map as MapIcon } from '@/components/icons';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { TripWithDetails, TripPlace, TripDay } from '@/hooks/useTrips';
import { useTripMutations } from '@/hooks/useTrips';
import { SortablePlaceCard, PlaceCardOverlay } from './SortablePlaceCard';
import { DayCard, type DaySlot } from './DayCard';
import { tripDateKey } from './tripPhase';
import { detectTripConflicts } from './tripConflicts';

interface Props {
  trip: TripWithDetails;
  onAddPlace: (dayId?: string, slot?: DaySlot) => void;
  /** Auto-scroll the today card into view on mount. Default true. */
  autoScrollToToday?: boolean;
  /** Viewer role: hide edit affordances and disable drag. RLS enforces server-side. */
  readOnly?: boolean;
}

export function DraggableItinerary({
  trip,
  onAddPlace,
  autoScrollToToday = true,
  readOnly = false,
}: Props) {
  const { t } = useTranslation();
  const { reorderStops, removePlace, updateDay } = useTripMutations();
  const { toast } = useToast();
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editDayTitle, setEditDayTitle] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const didScrollRef = useRef(false);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const sensors = useSensors(...(readOnly ? [] : [pointerSensor, keyboardSensor]));

  const placesByContainer = useMemo(() => {
    const map: Record<string, TripPlace[]> = { unassigned: [] };
    for (const day of trip.trip_days) {
      map[day.id] = [];
    }
    for (const place of trip.trip_places) {
      const key = place.day_id || 'unassigned';
      if (!map[key]) map[key] = [];
      map[key].push(place);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [trip.trip_days, trip.trip_places]);

  const activePlace = useMemo(
    () => (activeDragId ? trip.trip_places.find((p) => p.id === activeDragId) : null),
    [activeDragId, trip.trip_places],
  );

  const conflictsByDay = useMemo(() => {
    const all = detectTripConflicts(trip.trip_days, trip.trip_places);
    const map: Record<string, typeof all> = {};
    for (const c of all) {
      if (!c.dayId) continue;
      (map[c.dayId] ||= []).push(c);
    }
    return map;
  }, [trip.trip_days, trip.trip_places]);

  // Weather fallback for days without their own coordinates: the first
  // coordinate anywhere in the trip.
  const tripCoord = useMemo(() => {
    const p = trip.trip_places.find((pl) => pl.latitude != null && pl.longitude != null);
    return p ? { lat: p.latitude!, lng: p.longitude! } : null;
  }, [trip.trip_places]);

  const sortedDays = useMemo(() => {
    const sorted = [...trip.trip_days].sort((a, b) => a.date.localeCompare(b.date));
    const firstDate = sorted[0]?.date ? parseISO(sorted[0].date) : null;
    const today = tripDateKey(new Date(), trip.timezone);
    return sorted.map((day, index) => {
      const date = parseISO(day.date);
      return {
        day,
        index,
        dayNumber: firstDate != null ? differenceInCalendarDays(date, firstDate) + 1 : index + 1,
        isFirst: index === 0,
        isLast: index === sorted.length - 1,
        isToday: day.date === today,
        isPast: day.date < today,
        isFuture: day.date > today,
      };
    });
  }, [trip.trip_days, trip.timezone]);

  // Auto-scroll to today on mount
  useEffect(() => {
    if (!autoScrollToToday || didScrollRef.current) return;
    const root = rootRef.current;
    if (!root) return;
    const todayEl = root.querySelector<HTMLElement>('[data-day-today="true"]');
    if (todayEl) {
      didScrollRef.current = true;
      requestAnimationFrame(() => {
        todayEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [autoScrollToToday, sortedDays]);

  const findContainer = useCallback(
    (id: string): string | null => {
      if (id === 'unassigned' || trip.trip_days.some((d) => d.id === id)) return id;
      for (const [key, places] of Object.entries(placesByContainer)) {
        if (places.some((p) => p.id === id)) return key;
      }
      return null;
    },
    [placesByContainer, trip.trip_days],
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragOver = (_event: DragOverEvent) => {};

  const moveStop = (placeId: string, target: string, index: number) => {
    const source = findContainer(placeId);
    if (!source || readOnly || reorderStops.isPending) return;
    const sourceItems = placesByContainer[source] ?? [];
    const from = sourceItems.findIndex((p) => p.id === placeId);
    if (from < 0 || (source === target && from === index)) return;
    const place = sourceItems[from];
    const destinationItems = placesByContainer[target] ?? [];
    const next =
      source === target
        ? { [source]: arrayMove(sourceItems, from, index) }
        : {
            [source]: sourceItems.filter((p) => p.id !== placeId),
            [target]: [
              ...destinationItems.slice(0, index),
              place,
              ...destinationItems.slice(index),
            ],
          };
    const changes = Object.entries(next).flatMap(([container, items]) => {
      const dayId = container === 'unassigned' ? null : container;
      return items.map((p, sortOrder) => ({
        id: p.id,
        old_day_id: p.day_id,
        old_sort_order: p.sort_order,
        day_id: dayId,
        sort_order: sortOrder,
      }));
    });
    reorderStops.mutate(
      { tripId: trip.id, changes },
      {
        onSuccess: () => toast({ title: t('trips.itinerary.moved') }),
        onError: () =>
          toast({
            title: t('trips.itinerary.moveFailed', 'Could not move this stop'),
            description: t('trips.itinerary.moveRetry', 'Check your connection and try again.'),
            variant: 'destructive',
          }),
      },
    );
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragId(null);
    if (!over) return;
    const target = findContainer(String(over.id));
    if (!target) return;
    const items = placesByContainer[target] ?? [];
    const index = items.findIndex((p) => p.id === over.id);
    if (index < 0 && findContainer(String(active.id)) === target) return;
    moveStop(String(active.id), target, index < 0 ? items.length : index);
  };

  const renderMoveActions = (place: TripPlace) => {
    if (readOnly) return null;
    const source = place.day_id ?? 'unassigned';
    const items = placesByContainer[source] ?? [];
    const index = items.findIndex((p) => p.id === place.id);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="min-h-11" disabled={reorderStops.isPending}>
            {t('trips.itinerary.moveStop', 'Move stop')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={index <= 0}
            onSelect={() => moveStop(place.id, source, index - 1)}
          >
            {t('trips.itinerary.moveUp', 'Move up')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index >= items.length - 1}
            onSelect={() => moveStop(place.id, source, index + 1)}
          >
            {t('trips.itinerary.moveDown', 'Move down')}
          </DropdownMenuItem>
          {source !== 'unassigned' && (
            <DropdownMenuItem
              onSelect={() => moveStop(place.id, 'unassigned', placesByContainer.unassigned.length)}
            >
              {t('trips.itinerary.unassigned')}
            </DropdownMenuItem>
          )}
          {sortedDays
            .filter(({ day }) => day.id !== source)
            .map(({ day, dayNumber }) => (
              <DropdownMenuItem
                key={day.id}
                onSelect={() => moveStop(place.id, day.id, placesByContainer[day.id]?.length ?? 0)}
              >
                {t('trips.itinerary.moveToDay', 'Move to day {{number}}', { number: dayNumber })}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const handleDelete = (placeId: string) => {
    removePlace.mutate(
      { id: placeId, tripId: trip.id },
      {
        onSuccess: () => toast({ title: t('trips.itinerary.removed') }),
        onError: (err) =>
          toast({
            title: t('trips.toast.error'),
            description: err.message,
            variant: 'destructive',
          }),
      },
    );
  };

  const startEditDay = (day: TripDay) => {
    setEditingDayId(day.id);
    setEditDayTitle(day.title || '');
  };

  const saveEditDay = () => {
    if (editingDayId) {
      updateDay.mutate(
        { id: editingDayId, title: editDayTitle || undefined },
        {
          onSuccess: () => toast({ title: t('trips.itinerary.dayUpdated') }),
          onError: (err) =>
            toast({
              title: t('trips.toast.error'),
              description: err.message,
              variant: 'destructive',
            }),
        },
      );
      setEditingDayId(null);
    }
  };

  const unassigned = placesByContainer['unassigned'] || [];
  const itineraryIsEmpty = trip.trip_days.length === 0 && unassigned.length === 0;

  return (
    <div ref={rootRef}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* Unassigned places */}
        {unassigned.length > 0 && (
          <div className="border border-dashed border-border rounded-container p-6 mb-4 bg-muted/40 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-background/60 px-4 py-1 text-xs2 font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
                  <Inbox size={12} aria-hidden="true" />
                  {t('trips.itinerary.unassigned')}
                </span>
                <Badge variant="outline" className="rounded-full">
                  {unassigned.length}
                </Badge>
              </div>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAddPlace()}
                  className="rounded-full"
                >
                  <Plus size={14} className="mr-1" />
                  {t('trips.itinerary.add')}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground block mb-4">
              {t('trips.itinerary.unassignedHint')}
            </p>
            <SortableContext
              items={unassigned.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {unassigned.map((place) => (
                <SortablePlaceCard
                  key={place.id}
                  place={place}
                  onDelete={handleDelete}
                  moveActions={renderMoveActions(place)}
                  tripStartDate={trip.start_date}
                  tripEndDate={trip.end_date}
                  readOnly={readOnly}
                />
              ))}
            </SortableContext>
          </div>
        )}

        {/* Empty state */}
        {itineraryIsEmpty && (
          <div className="text-center py-16 md:py-24 px-6 border border-dashed border-border rounded-container bg-muted/30 backdrop-blur-sm">
            <div className="relative w-16 h-16 mx-auto mb-6">
              <div
                className="absolute inset-0 rounded-full opacity-[0.08]"
                style={{ backgroundColor: 'hsl(var(--foreground))' }}
                aria-hidden="true"
              />
              <MapIcon
                size={28}
                aria-hidden="true"
                className="absolute inset-0 m-auto text-foreground"
              />
            </div>
            <h6 className="font-bold mb-2 text-xl tracking-tight">
              {t('trips.itinerary.emptyTitle')}
            </h6>
            <p className="text-sm text-muted-foreground mb-6 max-w-[420px] mx-auto leading-relaxed">
              {t('trips.itinerary.emptyDescription')}
            </p>
            <Button variant="brand" onClick={() => onAddPlace()} className="rounded-full">
              <Plus size={16} className="mr-1.5" />
              {t('trips.itinerary.addPlace')}
            </Button>
          </div>
        )}

        {/* Day spine */}
        {sortedDays.length > 0 ? (
          <div className="relative">
            <span
              aria-hidden="true"
              className="route-draw route-draw-y absolute bottom-10 left-[3.25rem] top-10 w-1 rounded-full bg-track-pink"
            />
            <div className="relative">
              {sortedDays.map((meta) => {
                const dayPlaces = placesByContainer[meta.day.id] || [];
                return (
                  <DayCard
                    key={meta.day.id}
                    day={meta.day}
                    dayNumber={meta.dayNumber}
                    totalDays={sortedDays.length}
                    isFirst={meta.isFirst}
                    isLast={meta.isLast}
                    isToday={meta.isToday}
                    isPast={meta.isPast}
                    isFuture={meta.isFuture}
                    places={dayPlaces}
                    tripStartDate={trip.start_date}
                    tripEndDate={trip.end_date}
                    editingTitle={editingDayId === meta.day.id}
                    draftTitle={editDayTitle}
                    activeDragId={activeDragId}
                    onStartEditTitle={() => startEditDay(meta.day)}
                    onChangeDraftTitle={setEditDayTitle}
                    onSaveTitle={saveEditDay}
                    onCancelEditTitle={() => setEditingDayId(null)}
                    onAddPlace={(slot) => onAddPlace(meta.day.id, slot)}
                    onDeletePlace={handleDelete}
                    renderMoveActions={renderMoveActions}
                    conflicts={conflictsByDay[meta.day.id]}
                    fallbackCoord={tripCoord}
                    readOnly={readOnly}
                  />
                );
              })}
            </div>
          </div>
        ) : null}

        {!itineraryIsEmpty && !readOnly && (
          <Button
            variant="outline"
            onClick={() => onAddPlace()}
            className="w-full mt-4 rounded-element border-dashed h-12"
          >
            <Plus size={16} className="mr-1.5" />
            {t('trips.itinerary.addPlace')}
          </Button>
        )}

        <DragOverlay>{activePlace ? <PlaceCardOverlay place={activePlace} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
