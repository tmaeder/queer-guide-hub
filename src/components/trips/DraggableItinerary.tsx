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
        <div className="border-[1.5px] border-dashed border-border rounded-lg p-4 mb-4 bg-muted">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Inbox style={{ width: 16, height: 16, opacity: 0.6 }} aria-hidden="true" />
              <p className="text-sm font-bold">{t('trips.itinerary.unassigned')}</p>
              <Badge variant="outline">{unassigned.length}</Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onAddPlace()}>
              <Plus style={{ width: 14, height: 14, marginRight: 4 }} />
              {t('trips.itinerary.add')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground block mb-2">
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
        <div className="text-center py-12 md:py-20 px-6 border-[1.5px] border-dashed border-border rounded-2xl">
          <div
            className="w-14 h-14 rounded-full opacity-[0.12] flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: 'hsl(var(--foreground))' }}
          />
          <MapIcon
            style={{
              width: 28,
              height: 28,
              marginTop: -46,
              marginBottom: 18,
              color: 'hsl(var(--foreground))',
            }}
            aria-hidden="true"
            className="mx-auto"
          />
          <h6 className="font-bold mb-1 text-lg">{t('trips.itinerary.emptyTitle')}</h6>
          <p className="text-sm text-muted-foreground mb-6 max-w-[420px] mx-auto">
            {t('trips.itinerary.emptyDescription')}
          </p>
          <Button variant="brand" onClick={() => onAddPlace()}>
            <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
            {t('trips.itinerary.addPlace')}
          </Button>
        </div>
      )}

      {/* Day containers */}
      {sortedDays.map(({ day, dayNumber }) => {
        const dayPlaces = placesByContainer[day.id] || [];
        return (
          <Card key={day.id} className="mb-3">
            <CardContent>
              <div className="flex items-center justify-between mb-3 gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="flex flex-col items-center justify-center flex-shrink-0 w-12 h-12 rounded-lg"
                    style={{
                      backgroundColor: 'hsl(var(--foreground))',
                      color: 'hsl(var(--background))',
                    }}
                    aria-hidden="true"
                  >
                    <span className="text-[9px] font-bold uppercase opacity-85" style={{ letterSpacing: '0.06em', lineHeight: 1 }}>
                      {t('trips.itinerary.dayShort')}
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1 }}>
                      {dayNumber}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-tight">
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

                  <Badge variant="outline">
                    {t('trips.card.placeCount', { count: dayPlaces.length })}
                  </Badge>
                </div>

                <Button variant="ghost" size="sm" onClick={() => onAddPlace(day.id)}>
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
                    className="border-[1.5px] border-dashed rounded-lg py-5 text-center min-h-[48px] transition-colors"
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
        <Button variant="outline" onClick={() => onAddPlace()} className="w-full mt-2">
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
