import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { GripVertical, MapPin, Hotel, CalendarDays, Star, Clock, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: 'background.paper',
          px: 1.5,
          py: 1,
          mb: 0.5,
          minHeight: 44,
          cursor: isDragging ? 'grabbing' : 'default',
          transition: 'background-color 0.15s, border-color 0.15s',
          '&:hover': {
            bgcolor: 'action.hover',
            borderColor: 'brand.main',
          },
          '&:hover .grip-handle, &:focus-within .grip-handle': {
            opacity: 1,
          },
          '&:hover .delete-btn, &:focus-within .delete-btn': {
            opacity: 1,
          },
        }}
      >
        {/* Grip handle */}
        <Box
          {...attributes}
          {...listeners}
          className="grip-handle"
          aria-label={t('trips.itinerary.dragHandleAria')}
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            cursor: 'grab',
            color: 'text.disabled',
            opacity: 0.45,
            transition: 'opacity 0.15s, color 0.15s',
            touchAction: 'none',
            '&:hover': { color: 'brand.main' },
            '&:active': { cursor: 'grabbing' },
          }}
        >
          <GripVertical style={{ width: 14, height: 14 }} />
        </Box>

        {/* Category icon circle */}
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon style={{ width: 13, height: 13 }} />
        </Box>

        {/* Place name + time */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, fontSize: 13 }} noWrap>
              {getPlaceName(place)}
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
          {place.start_time && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
              <Clock style={{ width: 10, height: 10 }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                {place.start_time.slice(0, 5)}
                {place.end_time && ` - ${place.end_time.slice(0, 5)}`}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Delete button */}
        <IconButton
          className="delete-btn"
          size="small"
          onClick={() => onDelete(place.id)}
          sx={{
            opacity: 0,
            transition: 'opacity 0.15s',
            p: 0.5,
            minHeight: 44,
            minWidth: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X style={{ width: 14, height: 14 }} />
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
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderRadius: 1.5,
        border: '2px solid',
        borderColor: 'primary.main',
        bgcolor: 'background.paper',
        px: 1.5,
        py: 1,
        width: 320,
        opacity: 0.95,
        boxShadow: 4,
      }}
    >
      <GripVertical style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.4 }} />
      <Box
        sx={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon style={{ width: 13, height: 13 }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: 13 }} noWrap>
            {getPlaceName(place)}
          </Typography>
          {eqScore !== null && (
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: ringColor, flexShrink: 0 }} />
          )}
        </Box>
      </Box>
    </Box>
  );
}
