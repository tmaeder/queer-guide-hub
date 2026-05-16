import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Plus, Inbox, Map as MapIcon } from 'lucide-react';
import { differenceInCalendarDays, isSameDay } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { TripWithDetails, TripPlace, TripDay } from '@/hooks/useTrips';
import { useTripMutations } from '@/hooks/useTrips';
import { SortablePlaceCard, PlaceCardOverlay } from './SortablePlaceCard';
import { DayCard, type DaySlot } from './DayCard';

interface Props {
  trip: TripWithDetails;
  onAddPlace: (dayId?: string, slot?: DaySlot) => void;
  /** Auto-scroll the today card into view on mount. Default true. */
  autoScrollToToday?: boolean;
}

export function DraggableItinerary({
  trip,
  onAddPlace,
  autoScrollToToday = true,
}: Props) {
  const { t } = useTranslation();
  const { updatePlace, removePlace, updateDay } = useTripMutations();
  const { toast } = useToast();
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editDayTitle, setEditDayTitle] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const didScrollRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

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

  const sortedDays = useMemo(() => {
    const sorted = [...trip.trip_days].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const firstDate = sorted[0]?.date ? new Date(sorted[0].date) : null;
    const now = new Date();
    return sorted.map((day, index) => {
      const date = new Date(day.date);
      return {
        day,
        index,
        dayNumber:
          firstDate != null
            ? differenceInCalendarDays(date, firstDate) + 1
            : index + 1,
        isFirst: index === 0,
        isLast: index === sorted.length - 1,
        isToday: isSameDay(date, now),
        isPast: date < now && !isSameDay(date, now),
        isFuture: date > now && !isSameDay(date, now),
      };
    });
  }, [trip.trip_days]);

  // Auto-scroll to today on mount
  useEffect(() => {
    if (!autoScrollToToday || didScrollRef.current) return;
    const root = rootRef.current;
    if (!root) return;
    const todayEl = root.querySelector<HTMLElement>('[data-day-today="true"]');
    if (todayEl) {
      didScrollRef.current = true;
      // defer to next frame so layout is settled
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

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeContainer = findContainer(activeId);
    let overContainer = findContainer(overId);

    if (overId === 'unassigned' || trip.trip_days.some((d) => d.id === overId)) {
      overContainer = overId;
    }

    if (!activeContainer || !overContainer) return;

    const newDayId = overContainer === 'unassigned' ? null : overContainer;

    if (activeContainer === overContainer) {
      const items = placesByContainer[activeContainer] || [];
      const oldIndex = items.findIndex((p) => p.id === activeId);
      const overItem = items.findIndex((p) => p.id === overId);
      if (oldIndex === -1 || overItem === -1 || oldIndex === overItem) return;

      const reordered = arrayMove(items, oldIndex, overItem);
      reordered.forEach((place, idx) => {
        if (place.sort_order !== idx) {
          updatePlace.mutate({ id: place.id, sort_order: idx });
        }
      });
      toast({ title: t('trips.itinerary.reordered') });
    } else {
      const destItems = placesByContainer[overContainer] || [];
      let insertIndex = destItems.length;
      const overIdx = destItems.findIndex((p) => p.id === overId);
      if (overIdx !== -1) insertIndex = overIdx;

      updatePlace.mutate({
        id: activeId,
        day_id: newDayId,
        sort_order: insertIndex,
      });

      destItems.forEach((place, idx) => {
        const newOrder = idx >= insertIndex ? idx + 1 : idx;
        if (place.sort_order !== newOrder) {
          updatePlace.mutate({ id: place.id, sort_order: newOrder });
        }
      });
      toast({ title: t('trips.itinerary.moved') });
    }
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
  const itineraryIsEmpty =
    trip.trip_days.length === 0 && unassigned.length === 0;

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
          <div className="border border-dashed border-border rounded-container p-5 mb-4 bg-muted/40 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
                  <Inbox style={{ width: 12, height: 12 }} aria-hidden="true" />
                  {t('trips.itinerary.unassigned')}
                </span>
                <Badge variant="outline" className="rounded-full">{unassigned.length}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onAddPlace()} className="rounded-full">
                <Plus style={{ width: 14, height: 14, marginRight: 4 }} />
                {t('trips.itinerary.add')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground block mb-3">
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
                  tripStartDate={trip.start_date}
                  tripEndDate={trip.end_date}
                />
              ))}
            </SortableContext>
          </div>
        )}

        {/* Empty state */}
        {itineraryIsEmpty && (
          <div className="text-center py-16 md:py-24 px-6 border border-dashed border-border rounded-container bg-muted/30 backdrop-blur-sm">
            <div className="relative w-16 h-16 mx-auto mb-5">
              <div
                className="absolute inset-0 rounded-full opacity-[0.08]"
                style={{ backgroundColor: 'hsl(var(--foreground))' }}
                aria-hidden="true"
              />
              <MapIcon
                style={{ width: 28, height: 28, color: 'hsl(var(--foreground))' }}
                aria-hidden="true"
                className="absolute inset-0 m-auto"
              />
            </div>
            <h6 className="font-bold mb-2 text-xl tracking-tight">{t('trips.itinerary.emptyTitle')}</h6>
            <p className="text-sm text-muted-foreground mb-6 max-w-[420px] mx-auto leading-relaxed">
              {t('trips.itinerary.emptyDescription')}
            </p>
            <Button variant="brand" onClick={() => onAddPlace()} className="rounded-full">
              <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
              {t('trips.itinerary.addPlace')}
            </Button>
          </div>
        )}

        {/* Day spine */}
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
            />
          );
        })}

        {!itineraryIsEmpty && (
          <Button variant="outline" onClick={() => onAddPlace()} className="w-full mt-3 rounded-element border-dashed h-12">
            <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
            {t('trips.itinerary.addPlace')}
          </Button>
        )}

        <DragOverlay>
          {activePlace ? <PlaceCardOverlay place={activePlace} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
