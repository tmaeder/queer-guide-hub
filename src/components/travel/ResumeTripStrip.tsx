import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, MapPin, ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useTrips } from '@/hooks/useTrips';
import { useAuth } from '@/hooks/useAuth';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { resolveTripTitle } from '@/components/trips/tripTitle';
import { isMeaningfulTrip } from '@/components/trips/tripsFilters';

/**
 * "Active trip" hero card on /travel. Shows the user's most relevant in-progress
 * trip and a dropdown when there are multiple meaningful trips. Renders nothing
 * for signed-out users or when no meaningful trips exist (caller falls back to
 * StartTripHero).
 */
export function ResumeTripStrip() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: trips, isLoading } = useTrips();
  const { activeTrip, setActiveTripId } = useActiveTrip();

  const meaningful = useMemo(
    () =>
      (trips ?? [])
        .filter((trip) => trip.status === 'planning' || trip.status === 'active')
        .filter(isMeaningfulTrip),
    [trips],
  );

  if (!user || isLoading) return null;
  if (meaningful.length === 0) return null;

  // Prefer the context-picked active trip when it's meaningful; else first one.
  const current =
    (activeTrip && meaningful.find((t) => t.id === activeTrip.id)) ?? meaningful[0];

  const title = resolveTripTitle(
    { title: current.title, primary_city_name: current.primary_city_name ?? null },
    t,
  );

  return (
    <section className="border border-border bg-background p-5 sm:p-6 mb-6 rounded">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            {t('pages.travel.hero.activeTripHeading', 'Continue your trip')}
          </div>
          <LocalizedLink
            to={`/trips/${current.id}`}
            className="font-bold text-xl tracking-tight truncate block hover:underline"
            style={{ textDecoration: 'none' }}
          >
            {title}
          </LocalizedLink>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
            {current.primary_city_name && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={14} aria-hidden />
                {current.primary_city_name}
              </span>
            )}
            {current.start_date && (
              <span className="inline-flex items-center gap-1">
                <Calendar size={14} aria-hidden />
                <time dateTime={current.start_date}>
                  {new Date(current.start_date).toLocaleDateString()}
                </time>
              </span>
            )}
            <span>
              {t('pages.travel.resume.placeCount', '{{count}} places', {
                count: current.place_count,
              })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {meaningful.length > 1 && (
            <select
              value={current.id}
              onChange={(e) => setActiveTripId(e.target.value)}
              className="border border-border bg-background px-3 py-2 text-sm"
              aria-label={t('pages.travel.plan.switchTrip', 'Switch active trip')}
            >
              {meaningful.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {resolveTripTitle(
                    { title: tr.title, primary_city_name: tr.primary_city_name ?? null },
                    t,
                  )}
                </option>
              ))}
            </select>
          )}
          <LocalizedLink
            to={`/trips/${current.id}`}
            className="inline-flex items-center gap-1 border border-border bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            style={{ textDecoration: 'none' }}
          >
            {t('pages.travel.hero.openTrip', 'Open trip')}
            <ArrowRight size={14} aria-hidden />
          </LocalizedLink>
        </div>
      </div>
    </section>
  );
}

/**
 * Predicate used by Travel.tsx to know whether the active-trip hero will render.
 * Keeps Travel.tsx state-machine decisions in sync with what this component shows.
 */
export function useHasMeaningfulActiveTrip(): boolean {
  const { user } = useAuth();
  const { data: trips } = useTrips();
  if (!user) return false;
  return (trips ?? [])
    .filter((trip) => trip.status === 'planning' || trip.status === 'active')
    .some(isMeaningfulTrip);
}
