import { useMemo } from 'react';
import { ArrowRight, Calendar, MapPin, Luggage } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import type { Trip } from '@/hooks/useTrips';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getTripPhase, phaseStatusText, daysFromToday } from './tripPhase';
import { resolveTripTitle } from './tripTitle';

interface Props {
  trips: Trip[];
}

type Hero = {
  trip: Trip;
  rank: number;
};

/**
 * Pick the most relevant trip to highlight at the top of `/trips`.
 * Order:
 *   1. live   (active right now)
 *   2. countdown (≤ 14 days out)
 *   3. plan   (dated, > 14 days out) — soonest first
 * Falls back to null when only memories / archived / seed trips exist.
 */
function pickHero(trips: Trip[]): Hero | null {
  const now = new Date();
  let best: Hero | null = null;
  for (const trip of trips) {
    const phase = getTripPhase(trip, now);
    let rank: number | null = null;
    if (phase === 'live') rank = 0;
    else if (phase === 'countdown') rank = 1;
    else if (phase === 'plan') rank = 2;
    if (rank === null) continue;
    const days = daysFromToday(trip.start_date, now) ?? Number.MAX_SAFE_INTEGER;
    const score = rank * 100000 + Math.max(days, 0);
    if (!best || score < best.rank) best = { trip, rank: score };
  }
  return best;
}

export function NextTripStrip({ trips }: Props) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const hero = useMemo(() => pickHero(trips), [trips]);

  if (!hero) return null;

  const { trip } = hero;
  const title = resolveTripTitle(trip, t);
  const phase = getTripPhase(trip);
  const status = phaseStatusText(trip, undefined, t);

  const dateRange =
    trip.start_date && trip.end_date
      ? `${format(new Date(trip.start_date), 'MMM d')} – ${format(
          new Date(trip.end_date),
          'MMM d, yyyy',
        )}`
      : trip.start_date
        ? format(new Date(trip.start_date), 'MMM d, yyyy')
        : null;

  const phaseBadgeLabel =
    phase === 'live'
      ? t('trips.next.live', 'Active now')
      : phase === 'countdown'
        ? t('trips.next.countdown', 'Coming up')
        : t('trips.next.upcoming', 'Upcoming');

  return (
    <Card className="mb-8 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-stretch">
        {trip.cover_image_url ? (
          <div
            className="md:w-64 h-40 md:h-auto bg-muted shrink-0"
            style={{
              backgroundImage: `url(${trip.cover_image_url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
            aria-hidden="true"
          />
        ) : (
          <div className="md:w-64 h-40 md:h-auto bg-muted flex items-center justify-center shrink-0">
            <Luggage style={{ width: 32, height: 32, opacity: 0.3 }} />
          </div>
        )}
        <div className="flex-1 p-5 md:p-6 flex flex-col gap-3 justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge
                variant="outline"
                className={
                  phase === 'live'
                    ? 'border-transparent bg-foreground text-background'
                    : undefined
                }
              >
                {phaseBadgeLabel}
              </Badge>
              <span className="text-xs text-muted-foreground">· {status}</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight mb-2">
              {title}
            </h2>
            <div className="flex items-center gap-4 flex-wrap text-muted-foreground text-sm">
              {dateRange && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar style={{ width: 14, height: 14, opacity: 0.7 }} />
                  {dateRange}
                </span>
              )}
              {trip.primary_city_name && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin style={{ width: 14, height: 14, opacity: 0.7 }} />
                  {trip.primary_city_name}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="brand"
              onClick={() => navigate(`/trips/${trip.id}`)}
            >
              {phase === 'live'
                ? t('trips.next.openLive', 'Open today’s plan')
                : t('trips.next.open', 'Open trip')}
              <ArrowRight style={{ width: 14, height: 14, marginLeft: 6 }} />
            </Button>
            {phase === 'live' && (
              <Button
                variant="outline"
                onClick={() => navigate(`/trips/${trip.id}/today`)}
              >
                {t('trips.next.today', 'Today’s view')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
