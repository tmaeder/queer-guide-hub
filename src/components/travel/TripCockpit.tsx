import { useTranslation } from 'react-i18next';
import { Calendar, MapPin, ArrowRight, Plus, Plane } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';
import { useTrips } from '@/hooks/useTrips';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { useMeaningfulTrips } from '@/hooks/useMeaningfulTrips';
import { resolveTripTitle } from '@/components/trips/tripTitle';
import { StartTripHero } from '@/components/travel/StartTripHero';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Adaptive hero for /travel hub v2. Replaces the legacy ResumeTripStrip + StartTripHero
 * pair: one component covers all three states (active trip / no trip / multi-trip).
 *
 * - Active trip: expanded card with destination, countdown, place count, "Continue"
 *   CTA. If the user has more than one meaningful trip, a quiet tab strip below the
 *   card lets them switch the active one without a separate dropdown.
 * - No trip: tight Start form (reuses StartTripHero).
 * - Loading: subtle skeleton; renders nothing for signed-out (caller decides).
 */
export function TripCockpit() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isLoading } = useTrips();
  const { activeTrip, setActiveTripId } = useActiveTrip();
  const meaningful = useMeaningfulTrips();

  if (!user || isLoading) return <CockpitSkeleton />;
  if (meaningful.length === 0) return <StartTripHero />;

  const current =
    (activeTrip && meaningful.find((trip) => trip.id === activeTrip.id)) ?? meaningful[0];
  const title = resolveTripTitle(
    { title: current.title, primary_city_name: current.primary_city_name ?? null },
    t,
  );
  const countdown = daysUntil(current.start_date);

  return (
    <section
      aria-labelledby="trip-cockpit-heading"
      className="mb-10 rounded-container border bg-background"
    >
      <div className="flex flex-wrap items-start justify-between gap-6 p-6 md:p-8">
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-2xs uppercase tracking-[0.18em] text-muted-foreground">
            {countdown !== null
              ? countdownLabel(t, countdown)
              : t('travel.cockpit.kicker', 'Next on your itinerary')}
          </p>
          <LocalizedLink
            to={`/trips/${current.id}`}
            className="block no-underline"
          >
            <h2
              id="trip-cockpit-heading"
              className="truncate text-headline-lg font-bold leading-tight text-foreground"
            >
              {title}
            </h2>
          </LocalizedLink>
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-13 text-muted-foreground">
            {current.primary_city_name ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={14} aria-hidden />
                {current.primary_city_name}
              </span>
            ) : null}
            {current.start_date ? (
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={14} aria-hidden />
                <time dateTime={current.start_date}>
                  {formatTripDates(current.start_date, current.end_date)}
                </time>
              </span>
            ) : null}
            <span>
              {t('pages.travel.resume.placeCount', '{{count}} places', {
                count: current.place_count,
              })}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button asChild>
            <LocalizedLink to={`/trips/${current.id}`} className="no-underline">
              {t('travel.cockpit.continue', 'Continue planning')}
              <ArrowRight size={16} className="ml-2" />
            </LocalizedLink>
          </Button>
          <Button asChild variant="outline">
            <LocalizedLink to="/trips/new" className="no-underline">
              <Plus size={16} className="mr-1.5" />
              {t('travel.cockpit.newTrip', 'New trip')}
            </LocalizedLink>
          </Button>
          <Button asChild variant="outline">
            <LocalizedLink to="/travel/book" className="no-underline">
              <Plane size={16} className="mr-1.5" />
              {t('travel.cockpit.book', 'Book')}
            </LocalizedLink>
          </Button>
        </div>
      </div>

      {meaningful.length > 1 ? (
        <TripSwitcher
          trips={meaningful}
          activeId={current.id}
          onChange={(id) => setActiveTripId(id)}
        />
      ) : null}
    </section>
  );
}

function TripSwitcher({
  trips,
  activeId,
  onChange,
}: {
  trips: ReturnType<typeof useMeaningfulTrips>;
  activeId: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="border-t">
      <div
        role="tablist"
        aria-label={t('travel.cockpit.switchTrip', 'Switch active trip')}
        className="flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {trips.map((trip) => {
          const isActive = trip.id === activeId;
          const label = resolveTripTitle(
            { title: trip.title, primary_city_name: trip.primary_city_name ?? null },
            t,
          );
          return (
            <button
              key={trip.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(trip.id)}
              className={cn(
                'shrink-0 rounded-element px-4 py-2 text-13 transition-colors',
                isActive
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CockpitSkeleton() {
  return (
    <section className="mb-10 rounded-container border bg-background p-8" aria-hidden>
      <div className="h-4 w-24 bg-muted" />
      <div className="mt-4 h-8 w-2/3 bg-muted" />
      <div className="mt-2 flex gap-4">
        <div className="h-4 w-24 bg-muted" />
        <div className="h-4 w-32 bg-muted" />
      </div>
    </section>
  );
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function countdownLabel(t: ReturnType<typeof useTranslation>['t'], days: number): string {
  if (days < 0) return t('travel.cockpit.inProgress', 'In progress');
  if (days === 0) return t('travel.cockpit.today', 'Starts today');
  if (days === 1) return t('travel.cockpit.tomorrow', 'Starts tomorrow');
  return t('travel.cockpit.inDays', 'In {{count}} days', { count: days });
}

function formatTripDates(start: string, end: string | null): string {
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const fmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (!e) return s.toLocaleDateString(undefined, fmt);
  if (s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${s.toLocaleDateString(undefined, fmt)} – ${e.toLocaleDateString(undefined, fmt)}`;
  }
  const fmtY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${s.toLocaleDateString(undefined, fmtY)} – ${e.toLocaleDateString(undefined, fmtY)}`;
}
