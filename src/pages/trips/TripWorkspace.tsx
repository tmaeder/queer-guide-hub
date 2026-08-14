import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { TripViewSwitcher, getTripViewFromSearch } from '@/components/trips/TripViewSwitcher';
import { PageContainer } from '@/components/layout/PageContainer';

const TripPlannerPage = lazy(() => import('./TripPlannerPage'));
const TodayModePage = lazy(() => import('./TodayModePage'));
const TripBookletPage = lazy(() => import('./TripBookletPage'));

export default function TripWorkspace() {
  const [searchParams] = useSearchParams();
  const view = getTripViewFromSearch(searchParams);

  return (
    <div className="relative">
      <div className="sticky top-16 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <PageContainer flush className="flex items-center justify-end py-2">
          <TripViewSwitcher current={view} />
        </PageContainer>
      </div>

      <Suspense fallback={<Skeleton className="h-96 mx-4 my-6" />}>
        {view === 'today' && <TodayModePage />}
        {view === 'booklet' && <TripBookletPage />}
        {view === 'share' && <TripPlannerPage />}
        {view === 'plan' && <TripPlannerPage />}
      </Suspense>
    </div>
  );
}
