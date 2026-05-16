import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { TripViewSwitcher, getTripViewFromSearch } from '@/components/trips/TripViewSwitcher';

const TripPlannerPage = lazy(() => import('./TripPlannerPage'));
const TodayModePage = lazy(() => import('./TodayModePage'));
const TripBookletPage = lazy(() => import('./TripBookletPage'));

export default function TripWorkspace() {
  const [searchParams] = useSearchParams();
  const view = getTripViewFromSearch(searchParams);

  return (
    <div className="relative">
      <div className="sticky top-16 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto px-4 py-2 flex items-center justify-end">
          <TripViewSwitcher current={view} />
        </div>
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
