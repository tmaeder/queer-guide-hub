import { useMemo } from 'react';
import { ArrowRight, Shield, ShieldAlert, Skull } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { useReservations } from '@/hooks/useReservations';
import { useTripSafety, type CountrySafety } from '@/hooks/useTripSafety';
import { computeTripSegments, type TripSegment } from '@/utils/tripSegments';
import type { TripDay, TripPlace } from '@/hooks/useTrips';

interface Props {
  tripId: string;
  tripPlaces: TripPlace[];
  tripDays: TripDay[];
}

const formatRange = (start: string, end: string): string => {
  if (start === end) return format(new Date(start), 'MMM d');
  return `${format(new Date(start), 'MMM d')} – ${format(new Date(end), 'MMM d')}`;
};

const scoreClass = (score: number | null): string => {
  if (score == null) return 'bg-muted text-muted-foreground';
  if (score < 30) return 'bg-destructive text-destructive-foreground';
  if (score < 50) return 'bg-yellow-500 text-white';
  if (score < 70) return 'bg-accent text-accent-foreground';
  return 'bg-green-600 text-white';
};

export function PerLegSafety({ tripId, tripPlaces, tripDays }: Props) {
  const { t } = useTranslation();
  const { data: reservations } = useReservations();

  const tripReservations = useMemo(
    () => (reservations ?? []).filter((r) => r.trip_id === tripId),
    [reservations, tripId],
  );

  const segments: TripSegment[] = useMemo(
    () => computeTripSegments(tripPlaces, tripDays, tripReservations),
    [tripPlaces, tripDays, tripReservations],
  );

  const segmentCountryIds = useMemo(() => segments.map((s) => s.country_id), [segments]);
  const safety = useTripSafety(segmentCountryIds);
  const countryById = useMemo(() => {
    const m = new Map<string, CountrySafety>();
    for (const c of safety.countries) m.set(c.id, c);
    return m;
  }, [safety.countries]);

  if (segments.length === 0) return null;

  return (
    <div className="mt-8">
      <p className="font-bold mb-3 uppercase tracking-wider text-xs text-muted-foreground">
        {t('trips.safety.perLegHeading', 'Per-leg breakdown')}
      </p>
      <div className="flex flex-col gap-2">
        {segments.map((seg, i) => {
          const country = countryById.get(seg.country_id);
          return (
            <div key={`${seg.country_id}:${seg.start_date}`}>
              <div className="flex items-center gap-3 p-3 bg-background">
                <div
                  className={`w-11 h-11 flex items-center justify-center shrink-0 font-extrabold tabular-nums text-[0.95rem] ${scoreClass(country?.equality_score ?? null)}`}
                  aria-label={
                    country?.equality_score != null
                      ? t('trips.safety.scoreAria', {
                          score: country.equality_score,
                          defaultValue: 'Equality score {{score}}',
                        })
                      : t('trips.safety.scoreUnknown', 'Unknown score')
                  }
                >
                  {country?.equality_score ?? '—'}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold">
                      {country?.name ?? t('trips.safety.unknownCountry', 'Unknown country')}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      · {formatRange(seg.start_date, seg.end_date)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      · {t('trips.safety.stopCount', {
                        count: seg.stop_count,
                        defaultValue: '{{count}} stop',
                      })}
                    </p>
                  </div>

                  {country && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {country.deathPenalty && (
                        <Badge variant="destructive" className="text-xs gap-1">
                          <Skull size={12} />
                          {t('trips.safety.chip.deathPenalty', 'Death penalty')}
                        </Badge>
                      )}
                      {!country.deathPenalty && country.criminalized && (
                        <Badge variant="destructive" className="text-xs gap-1">
                          <ShieldAlert size={12} />
                          {t('trips.safety.chip.criminalized', 'Same-sex acts criminalized')}
                        </Badge>
                      )}
                      {!country.criminalized && country.equality_score != null && country.equality_score < 50 && (
                        <Badge className="text-xs gap-1 bg-yellow-500 text-white hover:bg-yellow-500/80">
                          <ShieldAlert size={12} />
                          {t('trips.safety.chip.limitedRights', 'Limited LGBTQ+ rights')}
                        </Badge>
                      )}
                      {!country.criminalized && country.equality_score != null && country.equality_score >= 70 && (
                        <Badge variant="outline" className="text-xs gap-1 border-green-600 text-green-700">
                          <Shield size={12} />
                          {t('trips.safety.chip.protected', 'Strong legal protections')}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {i < segments.length - 1 && (
                <div className="flex items-center justify-center py-0.5 text-muted-foreground" aria-hidden>
                  <ArrowRight size={14} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
