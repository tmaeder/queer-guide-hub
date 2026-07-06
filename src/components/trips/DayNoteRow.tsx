import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { TripPlace } from '@/hooks/useTrips';
import { renderNoteIcon } from './noteIcons';

interface Props {
  place: TripPlace;
  onDelete: (placeId: string) => void;
  /** Viewer role: hide edit affordances. RLS enforces server-side. */
  readOnly?: boolean;
}

/** Compact sortable row for `category='note'` trip places. */
export function DayNoteRow({ place, onDelete, readOnly = false }: Props) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: place.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="group flex items-center gap-2 rounded-element bg-muted/50 px-4 py-1.5 mb-1.5 min-h-9"
      data-testid="day-note-row"
    >
      {!readOnly && (
        <div
          {...attributes}
          {...listeners}
          aria-label={t('trips.itinerary.dragHandleAria')}
          className="flex items-center shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/45"
          style={{ touchAction: 'none' }}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      )}
      {renderNoteIcon(place.icon, {
        className: 'w-3.5 h-3.5 shrink-0 text-muted-foreground',
        'aria-hidden': true,
      })}
      {place.start_time && (
        <span className="text-xs2 text-muted-foreground tabular-nums shrink-0">
          {place.start_time.slice(0, 5)}
        </span>
      )}
      <p className="flex-1 min-w-0 text-13 text-foreground/90 truncate">{place.custom_name}</p>
      {!readOnly && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(place.id)}
          aria-label={t('trips.dayNotes.delete', 'Delete note')}
          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity p-0.5 h-7 w-7 min-h-0 flex items-center justify-center"
        >
          <X className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}
