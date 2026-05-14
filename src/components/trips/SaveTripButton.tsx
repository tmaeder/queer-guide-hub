import { Bookmark, BookmarkCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useMyTripSaves, useToggleTripSave } from '@/hooks/useTripSaves';
import { useToast } from '@/hooks/use-toast';

interface Props {
  tripId: string;
  compact?: boolean;
}

/**
 * Bookmark/save toggle for a public trip. Optimistic UI via React Query
 * invalidation. Degrades silently if the `trip_saves` table isn't
 * migrated yet (errors swallowed in useMyTripSaves; mutation surfaces
 * a toast).
 */
export function SaveTripButton({ tripId, compact }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const { toast } = useToast();
  const { data: savedSet } = useMyTripSaves();
  const toggle = useToggleTripSave();
  const isSaved = savedSet?.has(tripId) ?? false;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      navigate('/auth');
      return;
    }
    toggle.mutate(
      { tripId, saved: isSaved },
      {
        onError: (err) => {
          toast({
            title: t('trips.save.error', 'Could not update save'),
            description: err instanceof Error ? err.message : String(err),
            variant: 'destructive',
          });
        },
      },
    );
  };

  const Icon = isSaved ? BookmarkCheck : Bookmark;
  const label = isSaved
    ? t('trips.save.saved', 'Saved')
    : t('trips.save.save', 'Save');

  if (compact) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleClick}
        disabled={toggle.isPending}
        aria-label={isSaved ? t('trips.save.unsaveAria', 'Unsave trip') : t('trips.save.saveAria', 'Save trip')}
        aria-pressed={isSaved}
        className="h-8 w-8 p-0"
      >
        <Icon style={{ width: 16, height: 16 }} />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={isSaved ? 'default' : 'outline'}
      size="sm"
      onClick={handleClick}
      disabled={toggle.isPending}
      aria-pressed={isSaved}
    >
      <Icon style={{ width: 14, height: 14, marginRight: 6 }} />
      {label}
    </Button>
  );
}
