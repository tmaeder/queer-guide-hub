import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import { Plus, MapPin, Hotel, CalendarDays, Star, Trash2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import type { TripDay, TripPlace } from '@/hooks/useTrips';
import { useTripMutations } from '@/hooks/useTrips';
import { getScoreRingColor } from '@/utils/equalityScore';
import { AddPlaceDialog } from './AddPlaceDialog';

const categoryIcons: Record<string, typeof MapPin> = {
  venue: MapPin,
  hotel: Hotel,
  event: CalendarDays,
};

function PlaceName(place: TripPlace): string {
  if (place.venues?.name) return place.venues.name;
  if (place.events?.title) return place.events.title;
  if (place.hotels?.name) return place.hotels.name;
  return place.custom_name || 'Untitled Place';
}

function PlaceCategory(place: TripPlace): string {
  if (place.venue_id) return 'venue';
  if (place.event_id) return 'event';
  if (place.hotel_id) return 'hotel';
  return place.category || 'custom';
}

interface PlaceCardProps {
  place: TripPlace;
  tripId: string;
}

function PlaceCard({ place, tripId }: PlaceCardProps) {
  const { removePlace } = useTripMutations();
  const cat = PlaceCategory(place);
  const Icon = categoryIcons[cat] || Star;
  const eqScore = place.countries?.equality_score ?? null;
  const ringColor = getScoreRingColor(eqScore);

  return (
    <Card variant="outlined" sx={{ mb: 1 }}>
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Box className="flex items-center gap-2">
          <Box
            className="rounded-full flex items-center justify-center shrink-0"
            sx={{ width: 28, height: 28, bgcolor: 'action.hover' }}
          >
            <Icon size={14} />
          </Box>

          <div className="flex-1 min-w-0">
            <Box className="flex items-center gap-1.5">
              <Typography variant="body2" fontWeight={600} noWrap>
                {PlaceName(place)}
              </Typography>
              {eqScore !== null && (
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: ringColor,
                    flexShrink: 0,
                  }}
                  title={`Equality score: ${eqScore}`}
                />
              )}
            </Box>
            <Box className="flex items-center gap-2 text-xs text-muted-foreground">
              <Chip label={cat} size="small" variant="outlined" sx={{ height: 18, fontSize: 11 }} />
              {place.start_time && (
                <span className="flex items-center gap-0.5">
                  <Clock size={10} />
                  {place.start_time.slice(0, 5)}
                </span>
              )}
              {place.countries?.name && (
                <span>{place.countries.name}</span>
              )}
            </Box>
          </div>

          <IconButton
            size="small"
            onClick={() => removePlace.mutate({ id: place.id, tripId })}
            sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
          >
            <Trash2 size={14} />
          </IconButton>
        </Box>
      </CardContent>
    </Card>
  );
}

interface Props {
  tripId: string;
  days: TripDay[];
  places: TripPlace[];
}

export function ItineraryView({ tripId, days, places }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [preselectedDayId, setPreselectedDayId] = useState<string | null>(null);

  const unassigned = places.filter((p) => !p.day_id);
  const placesByDay = (dayId: string) =>
    places.filter((p) => p.day_id === dayId).sort((a, b) => a.sort_order - b.sort_order);

  const openAddDialog = (dayId: string | null) => {
    setPreselectedDayId(dayId);
    setAddOpen(true);
  };

  return (
    <div>
      {unassigned.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Unassigned Places
          </Typography>
          {unassigned.map((place) => (
            <PlaceCard key={place.id} place={place} tripId={tripId} />
          ))}
        </Box>
      )}

      {days.length === 0 && unassigned.length === 0 && (
        <Box className="text-center py-12">
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Your itinerary is empty. Add some places to get started.
          </Typography>
        </Box>
      )}

      {days.map((day) => {
        const dayPlaces = placesByDay(day.id);
        return (
          <Box key={day.id} sx={{ mb: 3 }}>
            <Box className="flex items-center justify-between mb-1.5">
              <Box className="flex items-center gap-2">
                <Typography variant="subtitle1" fontWeight={600}>
                  {format(new Date(day.date), 'EEE, MMM d')}
                </Typography>
                {day.title && (
                  <Typography variant="body2" color="text.secondary">
                    -- {day.title}
                  </Typography>
                )}
              </Box>
              <Button
                size="small"
                startIcon={<Plus size={14} />}
                onClick={() => openAddDialog(day.id)}
              >
                Add
              </Button>
            </Box>

            {dayPlaces.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ ml: 1, mb: 1 }}>
                No places for this day yet.
              </Typography>
            )}

            {dayPlaces.map((place) => (
              <PlaceCard key={place.id} place={place} tripId={tripId} />
            ))}
          </Box>
        );
      })}

      <Button
        variant="outlined"
        startIcon={<Plus size={16} />}
        onClick={() => openAddDialog(null)}
        fullWidth
        sx={{ mt: 2 }}
      >
        Add Place
      </Button>

      <AddPlaceDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        tripId={tripId}
        days={days}
        preselectedDayId={preselectedDayId}
      />
    </div>
  );
}
