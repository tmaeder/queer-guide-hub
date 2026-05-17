import { AlertTriangle, Info, Hotel as HotelIcon, MapPin, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTrip } from '@/hooks/useTrips';
import { detectTripGaps, type GapKind } from '@/components/trips/tripGaps';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

interface Props {
  tripId: string;
  onFocusSection: (section: 'hotels' | 'venues' | 'events') => void;
}

function gapTarget(kind: GapKind): 'hotels' | 'venues' | 'events' {
  if (kind === 'no_lodging' || kind === 'unconfirmed_booking') return 'hotels';
  if (kind === 'no_dinner') return 'venues';
  return 'events';
}

export function PlanGapsSidebar({ tripId, onFocusSection }: Props) {
  const { t } = useTranslation();
  const { data: trip, isLoading } = useTrip(tripId);

  if (isLoading) {
    return (
      <aside className="border border-border bg-background p-4">
        <Skeleton className="h-5 w-24 mb-3" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4" />
      </aside>
    );
  }

  if (!trip) return null;
  const gaps = detectTripGaps(trip.trip_days, trip.trip_places);

  return (
    <aside className="border border-border bg-background p-4 sticky top-20">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t('pages.travel.plan.gaps.title', 'Trip gaps')}
        </h3>
        <LocalizedLink to={`/trips/${tripId}`} className="text-xs text-muted-foreground">
          {t('pages.travel.plan.gaps.open', 'Open trip')}
        </LocalizedLink>
      </div>

      {gaps.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('pages.travel.plan.gaps.empty', 'No gaps. Your itinerary looks complete.')}
        </p>
      ) : (
        <ul className="space-y-2">
          {gaps.slice(0, 8).map((gap, i) => {
            const target = gapTarget(gap.kind);
            const Icon =
              target === 'hotels'
                ? HotelIcon
                : target === 'venues'
                  ? MapPin
                  : Calendar;
            return (
              <li key={`${gap.kind}-${gap.dayId}-${i}`}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onFocusSection(target)}
                  className="w-full justify-start gap-2 text-left h-auto py-2"
                >
                  {gap.severity === 'warning' ? (
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="text-sm leading-snug flex-1">{gap.message}</span>
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </Button>
              </li>
            );
          })}
          {gaps.length > 8 && (
            <li className="text-xs text-muted-foreground pt-1">
              {t('pages.travel.plan.gaps.more', '+ {{count}} more', {
                count: gaps.length - 8,
              })}
            </li>
          )}
        </ul>
      )}
    </aside>
  );
}
