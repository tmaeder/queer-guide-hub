import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations } from '@/hooks/useTrips';
import { NOTE_ICONS, NOTE_ICON_SLUGS } from './noteIcons';

interface Props {
  open: boolean;
  onClose: () => void;
  tripId: string;
  dayId: string;
  nextSortOrder: number;
}

export function AddDayNoteDialog({ open, onClose, tripId, dayId, nextSortOrder }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { addPlace } = useTripMutations();

  const [text, setText] = useState('');
  const [time, setTime] = useState('');
  const [icon, setIcon] = useState<string>('note');

  const resetAndClose = () => {
    setText('');
    setTime('');
    setIcon('note');
    onClose();
  };

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    addPlace.mutate(
      {
        trip_id: tripId,
        day_id: dayId,
        venue_id: null,
        event_id: null,
        hotel_id: null,
        custom_name: trimmed,
        custom_address: null,
        latitude: null,
        longitude: null,
        city_id: null,
        country_id: null,
        start_time: time || null,
        end_time: null,
        duration_minutes: null,
        notes: null,
        category: 'note',
        icon,
        sort_order: nextSortOrder,
        booking_status: 'intent',
        reservation_id: null,
      },
      {
        onSuccess: () => {
          toast({ title: t('trips.dayNotes.added', 'Note added') });
          resetAndClose();
        },
        onError: (err) =>
          toast({
            title: t('trips.toast.error'),
            description: err.message,
            variant: 'destructive',
          }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && resetAndClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('trips.dayNotes.addTitle', 'Add a note to this day')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="day-note-text">{t('trips.dayNotes.textLabel', 'Note')}</Label>
            <Input
              id="day-note-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('trips.dayNotes.textPlaceholder', 'e.g. Check-out by 11:00')}
              maxLength={140}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="day-note-time">
              {t('trips.dayNotes.timeLabel', 'Time (optional)')}
            </Label>
            <Input
              id="day-note-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="max-w-[140px]"
            />
          </div>

          <div className="space-y-2">
            <Label>{t('trips.dayNotes.iconLabel', 'Icon')}</Label>
            <div
              role="radiogroup"
              aria-label={t('trips.dayNotes.iconLabel', 'Icon')}
              className="flex flex-wrap gap-1.5"
            >
              {NOTE_ICON_SLUGS.map((slug) => {
                const Icon = NOTE_ICONS[slug];
                const selected = icon === slug;
                return (
                  <button
                    key={slug}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={slug}
                    onClick={() => setIcon(slug)}
                    className={`flex items-center justify-center w-9 h-9 rounded-element border transition-colors ${
                      selected
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!text.trim() || addPlace.isPending}>
            {addPlace.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('trips.dayNotes.save', 'Add note')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
