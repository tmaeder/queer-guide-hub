import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DeferredSection } from '@/components/home/DeferredSection';
import { lazyRetry } from '@/utils/lazyRetry';

const MapShell = lazyRetry(() => import('@/components/map/MapShell'));

const MAP_HEIGHT = 480;

/**
 * Destination-discovery map for /travel: cities, queer villages and events at
 * world altitude (surface="travel" — no venues layer; that's /map's job).
 *
 * Two gates keep the ~1MB maplibre chunk off the first paint even though this
 * is the second section of the page: DeferredSection with a tight 200px
 * rootMargin (the 800px default is above the fold on tall screens), then the
 * requestIdleCallback ready-flag from the homepage hero, which only starts
 * counting once the section is actually approached.
 */
export function TravelDiscoveryMap() {
  const { t } = useTranslation();
  return (
    <div>
      <DeferredSection fallback={<MapSkeleton />} rootMargin="200px 0px" minHeight={MAP_HEIGHT}>
        <IdleMountedMap />
      </DeferredSection>
      <p className="mt-4 text-13 text-muted-foreground">
        <LocalizedLink
          to="/map"
          className="inline-flex items-center gap-2 font-medium no-underline hover:text-foreground"
        >
          {t('pages.travel.map.fullMap', 'Full map with venues and filters')}
          <ArrowRight size={14} />
        </LocalizedLink>
      </p>
    </div>
  );
}

function IdleMountedMap() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), 200);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <ErrorBoundary section="travel-map" fallback={<MapErrorFallback />}>
      {ready ? (
        <React.Suspense fallback={<MapSkeleton />}>
          <MapShell surface="travel" height={MAP_HEIGHT} cooperativeGestures />
        </React.Suspense>
      ) : (
        <MapSkeleton />
      )}
    </ErrorBoundary>
  );
}

function MapSkeleton() {
  return (
    <div
      aria-hidden
      className="w-full animate-pulse rounded-container bg-muted"
      style={{ height: MAP_HEIGHT }}
    />
  );
}

function MapErrorFallback() {
  const { t } = useTranslation();
  return (
    <div
      className="flex w-full items-center justify-center rounded-container bg-muted"
      style={{ height: MAP_HEIGHT }}
    >
      <LocalizedLink to="/map" className="font-medium">
        {t('pages.travel.map.openFull', 'Open the full map')}
      </LocalizedLink>
    </div>
  );
}
