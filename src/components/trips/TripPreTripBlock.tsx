import { useMemo, useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { AlertTriangle, Info, Calendar, Ticket, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TripWithDetails } from '@/hooks/useTrips';
import { useTripReservations } from '@/hooks/useTripReservations';
import { Button } from '@/components/ui/button';
import { AddReservationDialog } from './AddReservationDialog';
import { TripBookingInbox } from './TripBookingInbox';
import { detectTripGaps } from './tripGaps';

interface Props {
  trip: TripWithDetails;
}

const LODGING_TYPES = new Set(['lodging', 'hotel', 'accommodation', 'apartment']);

export function TripPreTripBlock({ trip }: Props) {
  const { t } = useTranslation();
  const [addOpen, setAddOpen] = useState(false);
  const now = new Date();
  const start = trip.start_date ? new Date(trip.start_date) : null;
  const daysUntil = start ? differenceInCalendarDays(start, now) : null;

  const { data: reservations } = useTripReservations(trip.id);

  const gaps = useMemo(
    () => detectTripGaps(trip.trip_days, trip.trip_places),
    [trip.trip_days, trip.trip_places],
  );

  const bookingStats = useMemo(() => {
    const res = reservations ?? [];
    const lodgingCount = res.filter((r) => LODGING_TYPES.has(r.type?.toLowerCase() ?? '')).length;
    const otherCount = res.length - lodgingCount;
    const dayCount = trip.trip_days.length;
    return { lodgingCount, otherCount, totalRes: res.length, dayCount };
  }, [reservations, trip.trip_days.length]);

  const hidePreTrip =
    (daysUntil !== null && daysUntil < 0) ||
    (!start && gaps.length === 0 && bookingStats.totalRes === 0);

  if (hidePreTrip) {
    return <TripBookingInbox tripId={trip.id} />;
  }

  return (
    <>
    <TripBookingInbox tripId={trip.id} />
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

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Ticket className="h-4 w-4" aria-hidden />
            {t('trips.preTrip.bookings', '{{count}} reservations', {
              count: bookingStats.totalRes,
            })}
          </span>
          {bookingStats.lodgingCount > 0 && bookingStats.dayCount > 0 && (
            <span>
              ·{' '}
              {t('trips.preTrip.lodgingCoverage', '{{count}} lodging', {
                count: bookingStats.lodgingCount,
              })}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t('trips.preTrip.addReservation', 'Booked it')}
        </Button>
      </div>

      <AddReservationDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        tripId={trip.id}
      />
    </section>
    </>
  );
}
