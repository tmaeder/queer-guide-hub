import { useMemo } from 'react';
import { Luggage, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  useTripsCoveringDestination,
  type DestinationTarget,
} from '@/hooks/useTripsCoveringDestination';
import { cn } from '@/lib/utils';

export interface TripCoveringBannerProps {
  target: DestinationTarget;
  className?: string;
}

function formatRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const s = start ? new Date(start).toLocaleDateString(undefined, opts) : null;
  const e = end ? new Date(end).toLocaleDateString(undefined, opts) : null;
  if (s && e) return `${s} – ${e}`;
  return s ?? e;
}

/**
 * Thin contextual strip rendered above the editorial section nav when the
 * signed-in user already has a trip touching this destination.
 */
export function TripCoveringBanner({ target, className }: TripCoveringBannerProps) {
  const { t } = useTranslation();
  const { data } = useTripsCoveringDestination(target);

  const range = useMemo(
    () => (data ? formatRange(data.start_date, data.end_date) : null),
    [data],
  );

  if (!data) return null;

  const title = data.trip_title || t('trips.banner.fallbackTitle', 'your trip');

  return (
    <aside
      aria-label={t('trips.banner.label', 'Your trip covers this destination')}
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-y bg-muted px-4 py-3',
        className,
      )}
    >
      <div className="flex items-center gap-3 text-sm text-foreground">
        <Luggage size={16} aria-hidden="true" />
        <span>
          {range
            ? t('trips.banner.withDates', "You're visiting on {{trip}} · {{range}}", {
                trip: title,
                range,
              })
            : t('trips.banner.noDates', 'On your trip {{trip}}', { trip: title })}
          {data.saved_count > 0 ? (
            <span className="ml-2 text-muted-foreground">
              {t('trips.banner.savedCount', '· {{count}} saved', { count: data.saved_count })}
            </span>
          ) : null}
        </span>
      </div>
      <LocalizedLink
        to={`/trips/${data.trip_id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-foreground no-underline hover:opacity-80"
      >
        {t('trips.banner.open', 'Open trip')}
        <ArrowRight size={14} aria-hidden="true" />
      </LocalizedLink>
    </aside>
  );
}
