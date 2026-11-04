import { Suspense, lazy } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { getTripViewFromSearch, TripViewSwitcher } from '@/components/trips/TripViewSwitcher';
import { getTripWorkspaceSection } from '@/components/trips/tripWorkspaceSection';
import { PageContainer, STICKY_UNDER_HEADER } from '@/components/layout/PageContainer';
import { cn } from '@/lib/utils';
import { useTrip } from '@/hooks/useTrips';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { getTripPhase } from '@/components/trips/tripPhase';
import { AMBIENT_TRIP_WORKSPACE_ENABLED } from '@/lib/trips/ambientTripFlags';

const TripPlannerPage = lazy(() => import('./TripPlannerPage'));
const TodayModePage = lazy(() => import('./TodayModePage'));
const TripBookletPage = lazy(() => import('./TripBookletPage'));

export default function TripWorkspace() {
  const [search] = useSearchParams();
  const { tripId } = useParams<{ tripId: string }>();
  const { data: trip, isLoading } = useTrip(tripId);
  const online = useOnlineStatus();
  const phase = trip ? getTripPhase(trip) : 'plan';
  const view = getTripViewFromSearch(
    search,
    search.has('section') || phase !== 'live' ? 'plan' : 'today',
  );
  const section = AMBIENT_TRIP_WORKSPACE_ENABLED ? getTripWorkspaceSection(search, phase) : 'plan';
  const current = view === 'plan' ? section : view;

  if (online && isLoading && !search.has('view') && !search.has('section')) {
    return <Skeleton className="h-96 mx-4 my-6" />;
  }

  return (
    <div>
      <div className={cn('sticky z-30 border-b border-border bg-background', STICKY_UNDER_HEADER)}>
        <PageContainer flush>
          <TripViewSwitcher
            current={current}
            showToday={phase === 'live' || !online || view === 'today'}
          />
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
