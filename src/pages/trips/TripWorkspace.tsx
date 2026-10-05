import { Suspense, lazy } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { TripViewSwitcher, getTripViewFromSearch } from '@/components/trips/TripViewSwitcher';
import { TripSectionSwitcher } from '@/components/trips/TripSectionSwitcher';
import { PageContainer, STICKY_UNDER_HEADER } from '@/components/layout/PageContainer';
import { cn } from '@/lib/utils';
import { useTrip } from '@/hooks/useTrips';
import { getTripPhase } from '@/components/trips/tripPhase';
import { AMBIENT_TRIP_WORKSPACE_ENABLED } from '@/lib/trips/ambientTripFlags';

const TripPlannerPage = lazy(() => import('./TripPlannerPage'));
const TodayModePage = lazy(() => import('./TodayModePage'));
const TripBookletPage = lazy(() => import('./TripBookletPage'));

export default function TripWorkspace() {
  const [searchParams] = useSearchParams();
  const { tripId } = useParams<{ tripId: string }>();
  const { data: trip } = useTrip(tripId);
  const defaultView =
    searchParams.has('section') || !trip || getTripPhase(trip) !== 'live' ? 'plan' : 'today';
  const view = getTripViewFromSearch(searchParams, defaultView);

  return (
    <div className="relative">
      <div
        className={cn(
          'sticky z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
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
