import { Suspense, lazy } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { differenceInDays, format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { TripViewSwitcher, getTripViewFromSearch } from '@/components/trips/TripViewSwitcher';
import { TripSectionSwitcher } from '@/components/trips/TripSectionSwitcher';
import { PageContainer, STICKY_UNDER_HEADER } from '@/components/layout/PageContainer';
import { cn } from '@/lib/utils';
import { useTrip } from '@/hooks/useTrips';
import { getTripPhase } from '@/components/trips/tripPhase';
import { AMBIENT_TRIP_WORKSPACE_ENABLED } from '@/lib/trips/ambientTripFlags';
import { TripWorkspaceHero } from '@/components/trips/TripWorkspaceHero';
import { TravelJourneyNav } from '@/components/travel/TravelJourneyNav';

const TripPlannerPage = lazy(() => import('./TripPlannerPage'));
const TodayModePage = lazy(() => import('./TodayModePage'));
const TripBookletPage = lazy(() => import('./TripBookletPage'));

export default function TripWorkspace() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { tripId } = useParams<{ tripId: string }>();
  const { data: trip, isLoading: tripLoading } = useTrip(tripId);
  const defaultView =
    searchParams.has('section') || !trip || getTripPhase(trip) !== 'live' ? 'plan' : 'today';
  const view = getTripViewFromSearch(searchParams, defaultView);
  const dateRange =
    trip?.start_date && trip.end_date
      ? `${format(new Date(trip.start_date), 'MMM d')} – ${format(
          new Date(trip.end_date),
          'MMM d, yyyy',
        )} · ${t('trips.planner.days', {
          count: differenceInDays(new Date(trip.end_date), new Date(trip.start_date)) + 1,
        })}`
      : trip?.start_date
        ? t('trips.card.fromDate', { date: format(new Date(trip.start_date), 'MMM d, yyyy') })
        : null;

  return (
    <div className="relative">
      <PageContainer flush className="pt-6 md:pt-8">
        {trip ? (
          <TripWorkspaceHero
            trip={trip}
            dateRange={dateRange}
            statusLabel={t(`trips.status.${trip.status}`)}
          />
        ) : tripLoading ? (
          <Skeleton className="h-[20rem] rounded-container" />
        ) : null}
        <TravelJourneyNav className="mt-4" />
      </PageContainer>
      <div
        className={cn(
          'sticky z-30 mt-4 border-y border-border-hairline bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
          STICKY_UNDER_HEADER,
        )}
      >
        <PageContainer flush className="flex items-center justify-between gap-4 py-2">
          {view === 'plan' && AMBIENT_TRIP_WORKSPACE_ENABLED ? <TripSectionSwitcher /> : <span />}
          <TripViewSwitcher current={view} />
        </PageContainer>
      </div>

      <Suspense fallback={<Skeleton className="h-96 mx-4 my-6" />}>
        {view === 'today' && <TodayModePage />}
        {view === 'booklet' && <TripBookletPage />}
        {view === 'plan' && <TripPlannerPage />}
      </Suspense>
    </div>
  );
}
