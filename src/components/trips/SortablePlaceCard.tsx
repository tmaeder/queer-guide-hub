import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MapPin, Hotel, CalendarDays, Star, Clock, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { TripPlace } from '@/hooks/useTrips';
import { getScoreRingColor } from '@/utils/equalityScore';
import { PlaceBookableLinks } from './PlaceBookableLinks';

const categoryIcons: Record<string, typeof MapPin> = {
  venue: MapPin,
  hotel: Hotel,
  event: CalendarDays,
};

// eslint-disable-next-line react-refresh/only-export-components
export function getPlaceName(place: TripPlace): string {
  if (place.venues?.name) return place.venues.name;
  if (place.events?.title) return place.events.title;
  if (place.hotels?.name) return place.hotels.name;
  return place.custom_name || 'Untitled Place';
}

// eslint-disable-next-line react-refresh/only-export-components
export function getPlaceCategory(place: TripPlace): string {
  if (place.venue_id) return 'venue';
  if (place.event_id) return 'event';
  if (place.hotel_id) return 'hotel';
  return place.category || 'custom';
}

interface SortablePlaceCardProps {
  place: TripPlace;
  onDelete: (placeId: string) => void;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
}

export function SortablePlaceCard({
  place,
  onDelete,
  tripStartDate,
  tripEndDate,
}: SortablePlaceCardProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: place.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const cat = getPlaceCategory(place);
  const Icon = categoryIcons[cat] || Star;
  const eqScore = place.countries?.equality_score ?? null;
  const ringColor = getScoreRingColor(eqScore);

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`group flex items-center gap-2 bg-background border border-transparent hover:border-border rounded-container px-3 py-2 mb-1.5 min-h-[44px] transition-all hover:bg-muted/60 ${isDragging ? 'cursor-grabbing' : 'cursor-default'}`}
      >
        <div
          {...attributes}
          {...listeners}
          aria-label={t('trips.itinerary.dragHandleAria')}
          className="flex items-center shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/45 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
          style={{ touchAction: 'none' }}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Icon className="w-3 h-3" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-medium truncate">
              {getPlaceName(place)}
            </p>
            {eqScore !== null && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: ringColor }}
                title={`Equality score: ${eqScore}`}
              />
            )}
          </div>
          {place.start_time && (
            <div className="flex items-center gap-0.5 text-muted-foreground">
              <Clock className="w-2.5 h-2.5" />
              <span className="text-[11px] text-muted-foreground">
                {place.start_time.slice(0, 5)}
                {place.end_time && ` - ${place.end_time.slice(0, 5)}`}
              </span>
            </div>
          )}
        </div>

        <PlaceBookableLinks
          tripId={place.trip_id}
          tripPlaceId={place.id}
          category={cat as 'venue' | 'event' | 'hotel' | 'custom'}
          name={getPlaceName(place)}
          cityName={place.cities?.name ?? null}
          startDate={tripStartDate ?? null}
          endDate={tripEndDate ?? null}
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(place.id)}
          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity p-0.5 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Static version for use in DragOverlay (no sortable hooks) */
export function PlaceCardOverlay({ place }: { place: TripPlace }) {
  const cat = getPlaceCategory(place);
  const Icon = categoryIcons[cat] || Star;
  const eqScore = place.countries?.equality_score ?? null;
  const ringColor = getScoreRingColor(eqScore);

  return (
    <div className="flex items-center gap-2 rounded-container border border-foreground bg-background px-3 py-2 w-[320px] opacity-95 shadow-xl">
      <GripVertical className="w-3.5 h-3.5 shrink-0 opacity-40" />
      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-3 h-3" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium truncate">
            {getPlaceName(place)}
          </p>
          {eqScore !== null && (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ringColor }} />
          )}
        </div>
      </div>
    </div>
  );
}
