import { useMemo } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { AlertTriangle, Info, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TripWithDetails } from '@/hooks/useTrips';
import { detectTripGaps } from './tripGaps';

interface Props {
  trip: TripWithDetails;
}

export function TripPreTripBlock({ trip }: Props) {
  const { t } = useTranslation();
  const now = new Date();
  const start = trip.start_date ? new Date(trip.start_date) : null;
  const daysUntil = start ? differenceInCalendarDays(start, now) : null;

  const gaps = useMemo(
    () => detectTripGaps(trip.trip_days, trip.trip_places),
    [trip.trip_days, trip.trip_places],
  );

  if (daysUntil !== null && daysUntil < 0) return null;
  if (!start && gaps.length === 0) return null;

  return (
    <section
      aria-label={t('trips.preTrip.label', 'Pre-trip overview')}
      className="border border-border bg-background p-4 mb-4"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          {t('trips.preTrip.title', 'Before you go')}
        </h2>
        {start && daysUntil !== null && (
          <div className="inline-flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4" aria-hidden />
            {daysUntil === 0
              ? t('trips.preTrip.today', 'Starts today')
              : daysUntil === 1
                ? t('trips.preTrip.tomorrow', 'Starts tomorrow')
                : t('trips.preTrip.inDays', 'In {{count}} days', { count: daysUntil })}
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{format(start, 'PP')}</span>
          </div>
        )}
      </div>

      {gaps.length > 0 && (
        <ul className="space-y-1.5">
          {gaps.slice(0, 6).map((gap, i) => (
            <li
              key={`${gap.kind}-${gap.dayId}-${i}`}
              className="flex items-start gap-2 text-sm"
            >
              {gap.severity === 'warning' ? (
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
              ) : (
                <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span
                className={gap.severity === 'warning' ? '' : 'text-muted-foreground'}
              >
                {gap.message}
              </span>
            </li>
          ))}
          {gaps.length > 6 && (
            <li className="text-xs text-muted-foreground">
              {t('trips.preTrip.moreGaps', '+ {{count}} more', { count: gaps.length - 6 })}
            </li>
          )}
        </ul>
      )}

      {gaps.length === 0 && start && (
        <p className="text-sm text-muted-foreground">
          {t('trips.preTrip.allSet', 'Itinerary looks complete. No gaps detected.')}
        </p>
      )}
    </section>
  );
}
