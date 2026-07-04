import { useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  Sparkles,
  Smile,
  Meh,
  CloudRain,
  ImagePlus,
  Trash2,
  Loader2,
  NotebookPen,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import type { TripMember } from '@/hooks/useTrips';
import {
  useTripJournal,
  useTripJournalMutations,
  type JournalMood,
} from '@/hooks/useTripJournal';

const MOODS: Array<{ key: JournalMood; icon: typeof Smile; labelKey: string; label: string }> = [
  { key: 'joy', icon: Sparkles, labelKey: 'trips.journal.mood.joy', label: 'Joyful' },
  { key: 'good', icon: Smile, labelKey: 'trips.journal.mood.good', label: 'Good' },
  { key: 'mixed', icon: Meh, labelKey: 'trips.journal.mood.mixed', label: 'Mixed' },
  { key: 'tough', icon: CloudRain, labelKey: 'trips.journal.mood.tough', label: 'Tough' },
];

const MAX_PHOTOS = 4;

interface Props {
  tripId: string;
  members: TripMember[];
}

/** Journey — the trip's shared travel journal (entries + mood + photos). */
export function JournalTab({ tripId, members }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: entries = [], isLoading } = useTripJournal(tripId);
  const { addEntry, deleteEntry } = useTripJournalMutations(tripId);

  const [body, setBody] = useState('');
  const [mood, setMood] = useState<JournalMood | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const memberByUser = new Map(members.map((m) => [m.user_id, m]));

  const submit = () => {
    if (!body.trim() || addEntry.isPending) return;
    addEntry.mutate(
      { body, mood, photos },
      {
        onSuccess: () => {
          setBody('');
          setMood(null);
          setPhotos([]);
          toast({ title: t('trips.journal.saved', 'Journal entry saved') });
        },
        onError: (err) =>
          toast({
            title: t('trips.toast.error'),
            description: String(err),
            variant: 'destructive',
          }),
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Composer */}
      <Card>
        <CardContent className="space-y-4">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t(
              'trips.journal.placeholder',
              'What happened today? Small moments count.',
            )}
            maxLength={4000}
            rows={3}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div
              role="radiogroup"
              aria-label={t('trips.journal.moodLabel', 'Mood')}
              className="flex gap-1.5"
            >
              {MOODS.map(({ key, icon: Icon, labelKey, label }) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={mood === key}
                  aria-label={t(labelKey, label)}
                  title={t(labelKey, label)}
                  onClick={() => setMood(mood === key ? null : key)}
                  className={`flex items-center justify-center w-9 h-9 rounded-element border transition-colors ${
                    mood === key
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setPhotos((prev) => [...prev, ...files].slice(0, MAX_PHOTOS));
                  e.target.value = '';
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={photos.length >= MAX_PHOTOS}
              >
                <ImagePlus className="w-4 h-4 mr-1.5" />
                {t('trips.journal.addPhotos', 'Photos')}
              </Button>
              <Button size="sm" onClick={submit} disabled={!body.trim() || addEntry.isPending}>
                {addEntry.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                {t('trips.journal.save', 'Save entry')}
              </Button>
            </div>
          </div>
          {photos.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {photos.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs2 rounded-badge bg-muted text-muted-foreground"
                >
                  {f.name.slice(0, 24)}
                  <button
                    type="button"
                    aria-label={t('trips.journal.removePhoto', 'Remove photo')}
                    onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feed */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin" aria-label={t('common.loading', 'Loading')} />
        </div>
      )}

      {!isLoading && entries.length === 0 && (
        <div className="text-center py-10 border border-dashed border-border rounded-container">
          <NotebookPen className="w-6 h-6 mx-auto mb-2 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {t('trips.journal.empty', 'No journal entries yet.')}
          </p>
        </div>
      )}

      {entries.map((entry) => {
        const member = memberByUser.get(entry.user_id);
        const moodDef = MOODS.find((m) => m.key === entry.mood);
        const MoodIcon = moodDef?.icon;
        return (
          <Card key={entry.id} data-testid="journal-entry">
            <CardContent>
              <div className="flex items-center gap-2 mb-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={member?.profiles?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-2xs">
                    {(member?.profiles?.display_name ?? '?').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-13 font-medium">
                  {member?.profiles?.display_name ?? t('trips.journal.member', 'Traveler')}
                </span>
                <span className="text-xs2 text-muted-foreground">
                  {format(new Date(entry.created_at), 'PP')}
                </span>
                {MoodIcon && (
                  <Badge variant="outline" className="inline-flex items-center gap-1 ml-auto">
                    <MoodIcon className="w-3 h-3" aria-hidden />
                    {t(moodDef!.labelKey, moodDef!.label)}
                  </Badge>
                )}
                {entry.user_id === user?.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-7 w-7 p-0 ${MoodIcon ? '' : 'ml-auto'}`}
                    aria-label={t('trips.journal.delete', 'Delete entry')}
                    onClick={() => deleteEntry.mutate(entry)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">{entry.body}</p>
              {(entry.photo_urls?.length ?? 0) > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                  {entry.photo_urls!.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt=""
                      loading="lazy"
                      className="rounded-element object-cover aspect-square w-full"
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
