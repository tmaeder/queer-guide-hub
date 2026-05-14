import { useState } from 'react';
import { Plus, MapPin, Hotel, CalendarDays, Star, Trash2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    <Card className="mb-2">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className="rounded-full flex items-center justify-center shrink-0 w-7 h-7 bg-muted">
            <Icon size={14} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold truncate">{PlaceName(place)}</p>
              {eqScore !== null && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: ringColor }}
                  title={`Equality score: ${eqScore}`}
                />
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="h-[18px] text-[11px]">{cat}</Badge>
              {place.start_time && (
                <span className="flex items-center gap-0.5">
                  <Clock size={10} />
                  {place.start_time.slice(0, 5)}
                </span>
              )}
              {place.countries?.name && (
                <span>{place.countries.name}</span>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => removePlace.mutate({ id: place.id, tripId })}
            className="h-7 w-7 p-0 opacity-50 hover:opacity-100"
          >
            <Trash2 size={14} />
          </Button>
        </div>
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
        <div className="mb-6">
          <p className="text-sm font-semibold text-muted-foreground mb-2">
            Unassigned Places
          </p>
          {unassigned.map((place) => (
            <PlaceCard key={place.id} place={place} tripId={tripId} />
          ))}
        </div>
      )}

      {days.length === 0 && unassigned.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            Your itinerary is empty. Add some places to get started.
          </p>
        </div>
      )}

      {days.map((day) => {
        const dayPlaces = placesByDay(day.id);
        return (
          <div key={day.id} className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold">
                  {format(new Date(day.date), 'EEE, MMM d')}
                </p>
                {day.title && (
                  <p className="text-sm text-muted-foreground">
                    -- {day.title}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openAddDialog(day.id)}
              >
                <Plus size={14} className="mr-1" />
                Add
              </Button>
            </div>

            {dayPlaces.length === 0 && (
              <p className="text-sm text-muted-foreground ml-2 mb-2">
                No places for this day yet.
              </p>
            )}

            {dayPlaces.map((place) => (
              <PlaceCard key={place.id} place={place} tripId={tripId} />
            ))}
          </div>
        );
      })}

      <Button
        variant="outline"
        onClick={() => openAddDialog(null)}
        className="w-full mt-4"
      >
        <Plus size={16} className="mr-2" />
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
