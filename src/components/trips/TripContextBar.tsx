import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router';
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  CircleEllipsis,
  Luggage,
  MapPin,
  Ticket,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTrip } from '@/hooks/useTrips';
import { useTripReservations } from '@/hooks/useTripReservations';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { stripLocale } from '@/lib/locale';
import { detectTripGaps } from './tripGaps';
import { computeTripProgress } from './tripProgress';
import { getTripPhase, phaseLabel, phaseStatusText } from './tripPhase';
import { resolveTripTitle } from './tripTitle';
import { trackTripEvent } from '@/utils/tripTracking';
import { AMBIENT_TRIP_CONTEXT_ENABLED } from '@/lib/trips/ambientTripFlags';

const HIDDEN_PREFIXES = [
  '/trips',
  '/admin',
  '/auth',
  '/onboarding',
  '/settings',
  '/account',
  '/checkout',
  '/legal',
];

export function TripContextBar() {
  const { pathname } = useLocation();
  const routePath = stripLocale(pathname);
  const { activeTrip, isDismissed, dismiss, dockOpen, openDock, closeDock } = useActiveTrip();
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const detailId = dockOpen ? activeTrip?.id : undefined;
  const { data: trip, isLoading, error, refetch } = useTrip(detailId);
  const { data: reservations } = useTripReservations(detailId);

  if (!AMBIENT_TRIP_CONTEXT_ENABLED || import.meta.env.VITE_TRIP_CONTEXT_BAR === 'off') return null;
  if (!activeTrip || isDismissed) return null;
  if (
    HIDDEN_PREFIXES.some((prefix) => routePath === prefix || routePath.startsWith(`${prefix}/`))
  ) {
    return null;
  }
  if (typeof activeTrip.title === 'string' && activeTrip.title.trim().startsWith('<')) return null;

  const displayTitle = resolveTripTitle(activeTrip, t);
  const phase = getTripPhase(activeTrip);
  const status = phaseStatusText(activeTrip, undefined, t);
  const open = () => {
    openDock();
    trackTripEvent('trip_dock_open', { source: 'ambient-dock', phase });
  };

  return (
    <>
      <div
        role="region"
        aria-label={t('trips.contextBar.ariaLabel', 'Active trip context')}
        className="fixed inset-x-4 bottom-20 z-[1099] md:sticky md:inset-x-auto md:bottom-auto md:top-[var(--header-pinned-bottom)] md:px-6 md:py-2"
      >
        <div className="mx-auto flex min-h-12 max-w-[1400px] items-center gap-4 rounded-element bg-foreground px-4 py-2 text-background md:min-h-10 md:rounded-none md:bg-background md:text-foreground">
          <button
            type="button"
            onClick={open}
            className="flex min-w-0 flex-1 items-center gap-4 text-left"
            aria-expanded={dockOpen}
            aria-controls="active-trip-dock"
          >
            <Luggage className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{displayTitle}</span>
              <span className="block truncate text-xs opacity-70 md:hidden">
                {phaseLabel(phase, t)} · {status}
              </span>
            </span>
            <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
              {phaseLabel(phase, t)} · {status}
            </span>
            <CircleEllipsis className="h-4 w-4 shrink-0" aria-hidden />
          </button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('trips.contextBar.dismissAria', 'Dismiss trip context bar')}
            onClick={dismiss}
            className="h-8 w-8 shrink-0 p-0 text-current hover:bg-background/15 md:hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Sheet open={dockOpen} onOpenChange={(next) => (next ? openDock() : closeDock())}>
        <SheetContent
          id="active-trip-dock"
          side={mobile ? 'bottom' : 'right'}
          className={
            mobile
              ? 'max-h-[82vh] pb-[calc(1.5rem+env(safe-area-inset-bottom))]'
              : 'w-full sm:w-[440px]'
          }
        >
          <SheetHeader className="pr-10">
            <SheetTitle>{displayTitle}</SheetTitle>
            <SheetDescription>
              {phaseLabel(phase, t)} · {status}
            </SheetDescription>
          </SheetHeader>
          <TripDockBody
            trip={trip}
            loading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            reservationCount={reservations?.length ?? 0}
            onNavigate={closeDock}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

function TripDockBody({
  trip,
  loading,
  error,
  onRetry,
  reservationCount,
  onNavigate,
}: {
  trip: ReturnType<typeof useTrip>['data'];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  reservationCount: number;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (error && !trip) {
      trackTripEvent('trip_dock_load_failure', { source: 'ambient-dock' });
    }
  }, [error, trip]);
  const summary = useMemo(() => {
    if (!trip) return null;
    const gaps = detectTripGaps(trip.trip_days, trip.trip_places);
    const unscheduled = trip.trip_places.filter((place) => !place.day_id);
    const progress = computeTripProgress(trip);
    return { gaps, unscheduled, progress };
  }, [trip]);

  if (error && !trip) {
    return (
      <div role="alert" className="mt-8 border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm font-semibold">
          {t('trips.contextBar.loadError', 'Trip details could not be loaded.')}
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          {t('common.retry', 'Try again')}
        </Button>
      </div>
    );
  }

  if (loading || !trip || !summary) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mt-8 space-y-4"
        aria-label={t('common.loading', 'Loading')}
      >
        <div className="h-3 w-2/3 bg-muted" />
        <div className="h-20 bg-muted" />
        <div className="h-20 bg-muted" />
      </div>
    );
  }

  const phase = getTripPhase(trip);
  const next = nextAction(trip.id, phase);

  return (
    <div className="mt-8 space-y-8">
      <section aria-labelledby="trip-dock-progress">
        <div className="mb-2 flex items-end justify-between gap-4">
          <h3 id="trip-dock-progress" className="text-sm font-semibold">
            {t('trips.contextBar.readiness', 'Trip readiness')}
          </h3>
          <span className="text-sm tabular-nums text-muted-foreground">
            {summary.progress.percent}%
          </span>
        </div>
        <Progress value={summary.progress.percent} />
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <DockStat
            icon={MapPin}
            value={trip.trip_places.length}
            label={t('trips.tabs.places', 'Places')}
          />
          <DockStat
            icon={CalendarDays}
            value={trip.trip_days.length}
            label={t('trips.planner.days', 'Days')}
          />
          <DockStat icon={Ticket} value={reservationCount} label={t('trips.tabs.reservations')} />
        </div>
      </section>

      {summary.unscheduled.length > 0 ? (
        <section aria-labelledby="trip-dock-unscheduled">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 id="trip-dock-unscheduled" className="text-sm font-semibold">
              {t('trips.capture.unscheduled', 'Waiting to be scheduled')}
            </h3>
            <span className="text-xs tabular-nums text-muted-foreground">
              {summary.unscheduled.length}
            </span>
          </div>
          <ul className="space-y-2">
            {summary.unscheduled.slice(0, 4).map((place) => (
              <li key={place.id} className="truncate bg-muted px-4 py-2 text-sm">
                {place.venues?.name ??
                  place.events?.title ??
                  place.hotels?.name ??
                  place.custom_name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.gaps.length > 0 ? (
        <section aria-labelledby="trip-dock-gaps">
          <h3 id="trip-dock-gaps" className="mb-4 text-sm font-semibold">
            {t('trips.contextBar.nextUp', 'Needs attention')}
          </h3>
          <ul className="space-y-2">
            {summary.gaps.slice(0, 3).map((gap, index) => (
              <li
                key={`${gap.kind}-${gap.dayId}-${index}`}
                className="flex gap-2 text-sm text-muted-foreground"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{gap.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Button asChild className="w-full">
        <LocalizedLink to={next.href} onClick={onNavigate} className="no-underline">
          {t(next.labelKey, next.fallback)}
          <ChevronRight className="ml-2 h-4 w-4" aria-hidden />
        </LocalizedLink>
      </Button>
      <LocalizedLink
        to={`/trips/${trip.id}`}
        onClick={onNavigate}
        className="block text-center text-sm text-muted-foreground"
      >
        {t('trips.contextBar.openTrip', 'Open trip')}
      </LocalizedLink>
    </div>
  );
}

function DockStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof MapPin;
  value: number;
  label: string;
}) {
  return (
    <div className="bg-muted px-4 py-4">
      <Icon className="mb-2 h-4 w-4 text-muted-foreground" aria-hidden />
      <strong className="block tabular-nums">{value}</strong>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function nextAction(tripId: string, phase: ReturnType<typeof getTripPhase>) {
  if (phase === 'live') {
    return {
      href: `/trips/${tripId}?view=today`,
      labelKey: 'trips.today.title',
      fallback: 'Open Today',
    };
  }
  if (phase === 'countdown') {
    return {
      href: `/trips/${tripId}?section=prepare`,
      labelKey: 'trips.workspace.prepare',
      fallback: 'Finish preparing',
    };
  }
  if (phase === 'memory') {
    return {
      href: `/trips/${tripId}?section=together`,
      labelKey: 'trips.workspace.memories',
      fallback: 'Revisit the trip',
    };
  }
  return {
    href: `/trips/${tripId}?section=plan`,
    labelKey: 'trips.workspace.keepPlanning',
    fallback: 'Keep planning',
  };
}
