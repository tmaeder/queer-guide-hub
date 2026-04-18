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
import { Plus, Pencil, Check, Inbox, Map as MapIcon } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
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

  // Pre-compute day number + weekday + date for headers, sorted by date
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
        <Box
          sx={{
            border: '1.5px dashed',
            borderColor: 'divider',
            borderRadius: 2,
            p: 2,
            mb: 2,
            bgcolor: 'action.hover',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Inbox
                style={{ width: 16, height: 16, opacity: 0.6 }}
                aria-hidden="true"
              />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {t('trips.itinerary.unassigned')}
              </Typography>
              <Badge variant="outline">{unassigned.length}</Badge>
            </Box>
            <Button variant="ghost" size="sm" onClick={() => onAddPlace()}>
              <Plus style={{ width: 14, height: 14, marginRight: 4 }} />
              {t('trips.itinerary.add')}
            </Button>
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 1 }}
          >
            {t('trips.itinerary.unassignedHint')}
          </Typography>
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
        </Box>
      )}

      {/* Empty state */}
      {itineraryIsEmpty && (
        <Box
          sx={{
            textAlign: 'center',
            py: { xs: 6, md: 10 },
            px: 3,
            border: '1.5px dashed',
            borderColor: 'divider',
            borderRadius: 3,
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              bgcolor: 'brand.main',
              opacity: 0.12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 1.5,
            }}
          />
          <MapIcon
            style={{
              width: 28,
              height: 28,
              marginTop: -46,
              marginBottom: 18,
              color: '#DB2777',
            }}
            aria-hidden="true"
          />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            {t('trips.itinerary.emptyTitle')}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 3, maxWidth: 420, mx: 'auto' }}
          >
            {t('trips.itinerary.emptyDescription')}
          </Typography>
          <Button variant="brand" onClick={() => onAddPlace()}>
            <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
            {t('trips.itinerary.addPlace')}
          </Button>
        </Box>
      )}

      {/* Day containers */}
      {sortedDays.map(({ day, dayNumber }) => {
        const dayPlaces = placesByContainer[day.id] || [];
        return (
          <Card key={day.id} style={{ marginBottom: 12 }}>
            <CardContent>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1.5,
                  gap: 1.5,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      bgcolor: 'brand.main',
                      color: 'brand.contrastText',
                    }}
                    aria-hidden="true"
                  >
                    <Typography
                      sx={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        lineHeight: 1,
                        textTransform: 'uppercase',
                        opacity: 0.85,
                      }}
                    >
                      {t('trips.itinerary.dayShort')}
                    </Typography>
                    <Typography
                      sx={{
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontSize: 18,
                        fontWeight: 800,
                        lineHeight: 1.1,
                      }}
                    >
                      {dayNumber}
                    </Typography>
                  </Box>

                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 700,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        lineHeight: 1.2,
                      }}
                    >
                      {format(new Date(day.date), 'EEEE, MMM d')}
                    </Typography>

                    {editingDayId === day.id ? (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          mt: 0.25,
                        }}
                      >
                        <TextField
                          value={editDayTitle}
                          onChange={(e) => setEditDayTitle(e.target.value)}
                          placeholder={t('trips.itinerary.dayTitlePlaceholder')}
                          size="small"
                          variant="standard"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditDay();
                            if (e.key === 'Escape') setEditingDayId(null);
                          }}
                          sx={{ flex: 1, maxWidth: 240 }}
                        />
                        <IconButton
                          size="small"
                          onClick={saveEditDay}
                          aria-label={t('trips.itinerary.saveDayTitle')}
                          sx={{ p: 0.5 }}
                        >
                          <Check style={{ width: 14, height: 14 }} />
                        </IconButton>
                      </Box>
                    ) : (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          minWidth: 0,
                        }}
                      >
                        {day.title && (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            noWrap
                            sx={{ maxWidth: 280 }}
                          >
                            {day.title}
                          </Typography>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => startEditDay(day)}
                          aria-label={t('trips.itinerary.editDayTitle')}
                          sx={{
                            opacity: 0.4,
                            '&:hover': { opacity: 1 },
                            p: 0.5,
                          }}
                        >
                          <Pencil style={{ width: 12, height: 12 }} />
                        </IconButton>
                      </Box>
                    )}
                  </Box>

                  <Badge variant="outline">
                    {t('trips.card.placeCount', { count: dayPlaces.length })}
                  </Badge>
                </Box>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAddPlace(day.id)}
                >
                  <Plus style={{ width: 14, height: 14, marginRight: 4 }} />
                  {t('trips.itinerary.add')}
                </Button>
              </Box>

              <SortableContext
                items={dayPlaces.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {dayPlaces.length === 0 ? (
                  <Box
                    sx={{
                      border: '1.5px dashed',
                      borderColor: activeDragId ? 'brand.main' : 'divider',
                      borderRadius: 2,
                      py: 2.5,
                      textAlign: 'center',
                      minHeight: 48,
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: 12 }}
                    >
                      {t('trips.itinerary.dropHere')}
                    </Typography>
                  </Box>
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
        <Button
          variant="outline"
          onClick={() => onAddPlace()}
          style={{ width: '100%', marginTop: 8 }}
        >
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
