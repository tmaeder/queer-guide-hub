import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Trash2 } from 'lucide-react';
import type { TripListItem } from '@/hooks/useTrips';
import { isMeaningfulTrip } from './tripsFilters';
import { Button } from '@/components/ui/button';

const DISMISS_KEY = 'qg.emptyTripsBannerDismissed';

interface Props {
  trips: TripListItem[];
  onCleanup: (emptyTripIds: string[]) => void;
}

/**
 * Surfaces a dismissible banner when the user has accumulated multiple empty
 * trip stubs (no places, no dates, default title). Clicking "Review" passes
 * the empty trip IDs back to the parent so it can scope the list to them.
 *
 * Dismissal is keyed by count: if the user dismisses at N empties and later
 * creates more, the banner re-arms.
 */
export function EmptyTripsCleanupBanner({ trips, onCleanup }: Props) {
  const { t } = useTranslation();
  const emptyTrips = useMemo(
    () => trips.filter((trip) => !isMeaningfulTrip(trip)),
    [trips],
  );
  const count = emptyTrips.length;

  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      setDismissedAt(raw ? parseInt(raw, 10) || null : null);
    } catch {
      /* ignore */
    }
  }, []);

  if (count < 2) return null;
  if (dismissedAt !== null && count <= dismissedAt) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(count));
    } catch {
      /* ignore */
    }
    setDismissedAt(count);
  };

  return (
    <div
      className="border border-border bg-muted/30 p-4 mb-6 rounded flex items-start justify-between gap-4"
      role="status"
    >
      <div className="min-w-0">
        <p className="font-semibold text-sm">
          {t('pages.trips.emptyTripsBanner.title', '{{count}} empty trips', {
            count,
          })}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            'pages.trips.emptyTripsBanner.description',
            'Drafts without dates or saved places. Tidy them up to keep your trip list focused.',
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onCleanup(emptyTrips.map((t) => t.id))}
        >
          <Trash2 size={14} style={{ marginRight: 6 }} aria-hidden />
          {t('pages.trips.emptyTripsBanner.cta', 'Review')}
        </Button>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('pages.trips.emptyTripsBanner.dismiss', 'Dismiss')}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
