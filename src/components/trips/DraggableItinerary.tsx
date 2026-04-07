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
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import { Plus, Pencil, Check } from 'lucide-react';
import { format } from 'date-fns';
import type { TripWithDetails, TripPlace, TripDay } from '@/hooks/useTrips';
import { useTripMutations } from '@/hooks/useTrips';
import { SortablePlaceCard, PlaceCardOverlay } from './SortablePlaceCard';

interface Props {
  trip: TripWithDetails;
  onAddPlace: (dayId?: string) => void;
}

export function DraggableItinerary({ trip, onAddPlace }: Props) {
  const { updatePlace, removePlace, updateDay } = useTripMutations();
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
    // Sort each container by sort_order
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
      // Check if id is a container key
      if (id === 'unassigned' || trip.trip_days.some((d) => d.id === id)) return id;
      // Otherwise find the container for this place
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
    // Visual feedback handled by dnd-kit automatically
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeContainer = findContainer(activeId);
    let overContainer = findContainer(overId);

    // If we dropped directly on a container header
    if (overId === 'unassigned' || trip.trip_days.some((d) => d.id === overId)) {
      overContainer = overId;
    }

    if (!activeContainer || !overContainer) return;

    const newDayId = overContainer === 'unassigned' ? null : overContainer;

    if (activeContainer === overContainer) {
      // Reorder within same container
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
    } else {
      // Move to different container
      const destItems = placesByContainer[overContainer] || [];
      // Find insert index
      let insertIndex = destItems.length;
      const overIdx = destItems.findIndex((p) => p.id === overId);
      if (overIdx !== -1) insertIndex = overIdx;

      // Update moved place
      updatePlace.mutate({
        id: activeId,
        day_id: newDayId,
        sort_order: insertIndex,
      });

      // Reorder destination items after insert
      destItems.forEach((place, idx) => {
        const newOrder = idx >= insertIndex ? idx + 1 : idx;
        if (place.sort_order !== newOrder) {
          updatePlace.mutate({ id: place.id, sort_order: newOrder });
        }
      });
    }
  };

  const handleDelete = (placeId: string) => {
    removePlace.mutate({ id: placeId, tripId: trip.id });
  };

  const startEditDay = (day: TripDay) => {
    setEditingDayId(day.id);
    setEditDayTitle(day.title || '');
  };

  const saveEditDay = () => {
    if (editingDayId) {
      updateDay.mutate({ id: editingDayId, title: editDayTitle || undefined });
      setEditingDayId(null);
    }
  };

  const containerIds = ['unassigned', ...trip.trip_days.map((d) => d.id)];

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
        <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'action.hover' }}>
          <Box className="flex items-center justify-between mb-1.5">
            <Typography variant="subtitle2" color="text.secondary">
              Unassigned ({placesByContainer['unassigned']?.length || 0})
            </Typography>
            <Button size="small" startIcon={<Plus size={14} />} onClick={() => onAddPlace()}>
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
        </Paper>
      )}

      {/* Empty state */}
      {trip.trip_days.length === 0 && (placesByContainer['unassigned']?.length ?? 0) === 0 && (
        <Box className="text-center py-12">
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Your itinerary is empty. Add some places to get started.
          </Typography>
        </Box>
      )}

      {/* Day containers */}
      {trip.trip_days.map((day) => {
        const dayPlaces = placesByContainer[day.id] || [];
        return (
          <Paper key={day.id} variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Box className="flex items-center justify-between mb-1.5">
              <Box className="flex items-center gap-2 flex-1 min-w-0">
                <Typography variant="subtitle1" fontWeight={600} sx={{ flexShrink: 0 }}>
                  {format(new Date(day.date), 'EEE, MMM d')}
                </Typography>

                {editingDayId === day.id ? (
                  <Box className="flex items-center gap-1 flex-1">
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
                    <IconButton size="small" onClick={saveEditDay}>
                      <Check size={14} />
                    </IconButton>
                  </Box>
                ) : (
                  <Box className="flex items-center gap-1 min-w-0">
                    {day.title && (
                      <Typography variant="body2" color="text.secondary" noWrap>
                        -- {day.title}
                      </Typography>
                    )}
                    <IconButton
                      size="small"
                      onClick={() => startEditDay(day)}
                      sx={{ opacity: 0.4, '&:hover': { opacity: 1 }, p: 0.5 }}
                    >
                      <Pencil size={12} />
                    </IconButton>
                  </Box>
                )}

                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {dayPlaces.length} {dayPlaces.length === 1 ? 'place' : 'places'}
                </Typography>
              </Box>

              <Button size="small" startIcon={<Plus size={14} />} onClick={() => onAddPlace(day.id)}>
                Add
              </Button>
            </Box>

            <SortableContext
              items={dayPlaces.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {dayPlaces.length === 0 ? (
                <Box
                  className="border-2 border-dashed border-border rounded-lg py-4 text-center"
                  sx={{ minHeight: 48 }}
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
          </Paper>
        );
      })}

      <Button
        variant="outlined"
        startIcon={<Plus size={16} />}
        onClick={() => onAddPlace()}
        fullWidth
        sx={{ mt: 1 }}
      >
        Add Place
      </Button>

      <DragOverlay>
        {activePlace ? <PlaceCardOverlay place={activePlace} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
