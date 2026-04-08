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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import { Plus, Pencil, Check } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { TripWithDetails, TripPlace, TripDay } from '@/hooks/useTrips';
import { useTripMutations } from '@/hooks/useTrips';
import { SortablePlaceCard, PlaceCardOverlay } from './SortablePlaceCard';

interface Props {
  trip: TripWithDetails;
  onAddPlace: (dayId?: string) => void;
}

export function DraggableItinerary({ trip, onAddPlace }: Props) {
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

  const handleDragOver = (_event: DragOverEvent) => {
    // Visual feedback handled by dnd-kit
  };

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
      toast({ title: 'Place reordered' });
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
      toast({ title: 'Place moved' });
    }
  };

  const handleDelete = (placeId: string) => {
    removePlace.mutate(
      { id: placeId, tripId: trip.id },
      {
        onSuccess: () => toast({ title: 'Place removed' }),
        onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
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
          onSuccess: () => toast({ title: 'Day updated' }),
          onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
        },
      );
      setEditingDayId(null);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* Unassigned places */}
      {(placesByContainer['unassigned']?.length ?? 0) > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <CardContent>
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 1.5, p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Unassigned
                  </Typography>
                  <Badge variant="outline">
                    {placesByContainer['unassigned']?.length || 0}
                  </Badge>
                </Box>
                <Button variant="ghost" size="sm" onClick={() => onAddPlace()}>
                  <Plus style={{ width: 14, height: 14, marginRight: 4 }} />
                  Add
                </Button>
              </Box>
              <SortableContext
                items={(placesByContainer['unassigned'] || []).map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {(placesByContainer['unassigned'] || []).map((place) => (
                  <SortablePlaceCard key={place.id} place={place} onDelete={handleDelete} />
                ))}
              </SortableContext>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {trip.trip_days.length === 0 && (placesByContainer['unassigned']?.length ?? 0) === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Your itinerary is empty. Add some places to get started.
          </Typography>
          <Button variant="outline" onClick={() => onAddPlace()}>
            <Plus style={{ width: 14, height: 14, marginRight: 6 }} />
            Add Place
          </Button>
        </Box>
      )}

      {/* Day containers */}
      {trip.trip_days.map((day) => {
        const dayPlaces = placesByContainer[day.id] || [];
        return (
          <Card key={day.id} style={{ marginBottom: 12 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, flexShrink: 0 }}>
                    {format(new Date(day.date), 'EEE, MMM d')}
                  </Typography>

                  {editingDayId === day.id ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1 }}>
                      <TextField
                        value={editDayTitle}
                        onChange={(e) => setEditDayTitle(e.target.value)}
                        placeholder="Day title..."
                        size="small"
                        variant="standard"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditDay();
                          if (e.key === 'Escape') setEditingDayId(null);
                        }}
                        sx={{ flex: 1, maxWidth: 240 }}
                      />
                      <IconButton size="small" onClick={saveEditDay} sx={{ minHeight: 44, minWidth: 44 }}>
                        <Check style={{ width: 14, height: 14 }} />
                      </IconButton>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                      {day.title && (
                        <Typography variant="body2" color="text.secondary" noWrap>
                          -- {day.title}
                        </Typography>
                      )}
                      <IconButton
                        size="small"
                        onClick={() => startEditDay(day)}
                        sx={{ opacity: 0.4, '&:hover': { opacity: 1 }, p: 0.5, minHeight: 44, minWidth: 44 }}
                      >
                        <Pencil style={{ width: 12, height: 12 }} />
                      </IconButton>
                    </Box>
                  )}

                  <Badge variant="outline">
                    {dayPlaces.length} {dayPlaces.length === 1 ? 'place' : 'places'}
                  </Badge>
                </Box>

                <Button variant="ghost" size="sm" onClick={() => onAddPlace(day.id)}>
                  <Plus style={{ width: 14, height: 14, marginRight: 4 }} />
                  Add
                </Button>
              </Box>

              <SortableContext
                items={dayPlaces.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {dayPlaces.length === 0 ? (
                  <Box
                    sx={{
                      border: '2px dashed',
                      borderColor: activeDragId ? 'primary.main' : 'divider',
                      borderRadius: 2,
                      py: 3,
                      textAlign: 'center',
                      minHeight: 48,
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                      Drag places here or click Add
                    </Typography>
                  </Box>
                ) : (
                  dayPlaces.map((place) => (
                    <SortablePlaceCard key={place.id} place={place} onDelete={handleDelete} />
                  ))
                )}
              </SortableContext>
            </CardContent>
          </Card>
        );
      })}

      <Button
        variant="outline"
        onClick={() => onAddPlace()}
        style={{ width: '100%', marginTop: 8 }}
      >
        <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
        Add Place
      </Button>

      <DragOverlay>
        {activePlace ? <PlaceCardOverlay place={activePlace} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
