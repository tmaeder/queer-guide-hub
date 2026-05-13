import { useState, useMemo, useCallback } from 'react';
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
import { Plus, Pencil, Check, Inbox, Map as MapIcon } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type { TripWithDetails, TripPlace, TripDay } from '@/hooks/useTrips';
import { useTripMutations } from '@/hooks/useTrips';
import { SortablePlaceCard, PlaceCardOverlay } from './SortablePlaceCard';

interface Props {
  trip: TripWithDetails;
  onAddPlace: (dayId?: string) => void;
}

export function DraggableItinerary({ trip, onAddPlace }: Props) {
  const { t } = useTranslation();
  const { updatePlace, removePlace, updateDay } = useTripMutations();
  const { toast } = useToast();
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editDayTitle, setEditDayTitle] = useState('');

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
    return sorted.map((day, index) => ({
      day,
      index,
      dayNumber:
        firstDate != null
          ? differenceInCalendarDays(new Date(day.date), firstDate) + 1
          : index + 1,
    }));
  }, [trip.trip_days]);

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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* Unassigned places */}
      {unassigned.length > 0 && (
        <div className="border border-dashed border-border rounded-2xl p-5 mb-4 bg-muted/40 backdrop-blur-sm">
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
        <div className="text-center py-16 md:py-24 px-6 border border-dashed border-border rounded-3xl bg-muted/30 backdrop-blur-sm">
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

      {/* Day containers */}
      {sortedDays.map(({ day, dayNumber }) => {
        const dayPlaces = placesByContainer[day.id] || [];
        return (
          <Card key={day.id} className="mb-3 rounded-2xl border-border/70 overflow-hidden">
            <CardContent>
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="flex flex-col items-center justify-center flex-shrink-0 w-14 h-14 rounded-2xl"
                    style={{
                      backgroundColor: 'hsl(var(--foreground))',
                      color: 'hsl(var(--background))',
                    }}
                    aria-hidden="true"
                  >
                    <span className="text-[9px] font-semibold uppercase opacity-70" style={{ letterSpacing: '0.18em', lineHeight: 1 }}>
                      {t('trips.itinerary.dayShort')}
                    </span>
                    <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                      {dayNumber}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-tight tracking-tight">
                      {format(new Date(day.date), 'EEEE, MMM d')}
                    </p>

                    {editingDayId === day.id ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Input
                          value={editDayTitle}
                          onChange={(e) => setEditDayTitle(e.target.value)}
                          placeholder={t('trips.itinerary.dayTitlePlaceholder')}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditDay();
                            if (e.key === 'Escape') setEditingDayId(null);
                          }}
                          className="flex-1 max-w-[240px] h-8"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={saveEditDay}
                          aria-label={t('trips.itinerary.saveDayTitle')}
                        >
                          <Check style={{ width: 14, height: 14 }} />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 min-w-0">
                        {day.title && (
                          <p className="text-sm text-muted-foreground truncate max-w-[280px]">
                            {day.title}
                          </p>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-40 hover:opacity-100"
                          onClick={() => startEditDay(day)}
                          aria-label={t('trips.itinerary.editDayTitle')}
                        >
                          <Pencil style={{ width: 12, height: 12 }} />
                        </Button>
                      </div>
                    )}
                  </div>

                  <Badge variant="outline" className="rounded-full">
                    {t('trips.card.placeCount', { count: dayPlaces.length })}
                  </Badge>
                </div>

                <Button variant="ghost" size="sm" onClick={() => onAddPlace(day.id)} className="rounded-full">
                  <Plus style={{ width: 14, height: 14, marginRight: 4 }} />
                  {t('trips.itinerary.add')}
                </Button>
              </div>

              <SortableContext
                items={dayPlaces.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {dayPlaces.length === 0 ? (
                  <div
                    className="border border-dashed rounded-2xl py-6 text-center min-h-[56px] transition-colors bg-muted/20"
                    style={{
                      borderColor: activeDragId ? 'hsl(var(--foreground))' : 'hsl(var(--border))',
                    }}
                  >
                    <p className="text-xs text-muted-foreground">{t('trips.itinerary.dropHere')}</p>
                  </div>
                ) : (
                  dayPlaces.map((place) => (
                    <SortablePlaceCard
                      key={place.id}
                      place={place}
                      onDelete={handleDelete}
                      tripStartDate={trip.start_date}
                      tripEndDate={trip.end_date}
                    />
                  ))
                )}
              </SortableContext>
            </CardContent>
          </Card>
        );
      })}

      {!itineraryIsEmpty && (
        <Button variant="outline" onClick={() => onAddPlace()} className="w-full mt-3 rounded-2xl border-dashed h-12">
          <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
          {t('trips.itinerary.addPlace')}
        </Button>
      )}

      <DragOverlay>
        {activePlace ? <PlaceCardOverlay place={activePlace} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
