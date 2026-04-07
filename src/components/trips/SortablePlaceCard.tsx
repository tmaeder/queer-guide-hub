import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import { GripVertical, MapPin, Hotel, CalendarDays, Star, Trash2, Clock, X } from 'lucide-react';
import type { TripPlace } from '@/hooks/useTrips';
import { getScoreRingColor } from '@/utils/equalityScore';

const categoryIcons: Record<string, typeof MapPin> = {
  venue: MapPin,
  hotel: Hotel,
  event: CalendarDays,
};

export function getPlaceName(place: TripPlace): string {
  if (place.venues?.name) return place.venues.name;
  if (place.events?.title) return place.events.title;
  if (place.hotels?.name) return place.hotels.name;
  return place.custom_name || 'Untitled Place';
}

export function getPlaceCategory(place: TripPlace): string {
  if (place.venue_id) return 'venue';
  if (place.event_id) return 'event';
  if (place.hotel_id) return 'hotel';
  return place.category || 'custom';
}

interface SortablePlaceCardProps {
  place: TripPlace;
  onDelete: (placeId: string) => void;
}

export function SortablePlaceCard({ place, onDelete }: SortablePlaceCardProps) {
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
      <Box
        className="group flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 mb-1 hover:border-primary/30 transition-colors"
        sx={{ cursor: isDragging ? 'grabbing' : 'default' }}
      >
        <Box
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
          sx={{ display: 'flex', alignItems: 'center', touchAction: 'none' }}
        >
          <GripVertical size={14} />
        </Box>

        <Box
          className="rounded-full flex items-center justify-center shrink-0"
          sx={{ width: 26, height: 26, bgcolor: 'action.hover' }}
        >
          <Icon size={13} />
        </Box>

        <div className="flex-1 min-w-0">
          <Box className="flex items-center gap-1.5">
            <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: 13 }}>
              {getPlaceName(place)}
            </Typography>
            {eqScore !== null && (
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  bgcolor: ringColor,
                  flexShrink: 0,
                }}
                title={`Equality score: ${eqScore}`}
              />
            )}
          </Box>
          <Box className="flex items-center gap-2 text-xs text-muted-foreground">
            <Chip label={cat} size="small" variant="outlined" sx={{ height: 16, fontSize: 10, '& .MuiChip-label': { px: 0.75 } }} />
            {place.start_time && (
              <span className="flex items-center gap-0.5">
                <Clock size={9} />
                {place.start_time.slice(0, 5)}
                {place.end_time && ` - ${place.end_time.slice(0, 5)}`}
              </span>
            )}
          </Box>
        </div>

        <IconButton
          size="small"
          onClick={() => onDelete(place.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          sx={{ p: 0.5 }}
        >
          <X size={13} />
        </IconButton>
      </Box>
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
    <Box
      className="flex items-center gap-2 rounded-lg border-2 border-primary bg-background px-2 py-1.5 shadow-lg"
      sx={{ width: 320, opacity: 0.95 }}
    >
      <GripVertical size={14} className="text-muted-foreground shrink-0" />
      <Box
        className="rounded-full flex items-center justify-center shrink-0"
        sx={{ width: 26, height: 26, bgcolor: 'action.hover' }}
      >
        <Icon size={13} />
      </Box>
      <div className="flex-1 min-w-0">
        <Box className="flex items-center gap-1.5">
          <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: 13 }}>
            {getPlaceName(place)}
          </Typography>
          {eqScore !== null && (
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: ringColor, flexShrink: 0 }} />
          )}
        </Box>
        <Chip label={cat} size="small" variant="outlined" sx={{ height: 16, fontSize: 10, '& .MuiChip-label': { px: 0.75 } }} />
      </div>
    </Box>
  );
}
