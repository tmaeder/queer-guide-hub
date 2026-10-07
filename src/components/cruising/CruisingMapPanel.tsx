import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { isWebglSupported } from '@/lib/webglSupport';
import { lazyRetry } from '@/utils/lazyRetry';
import type { CruisingMapProps } from './CruisingMap';

const LazyCruisingMap = lazyRetry(() =>
  import('./CruisingMap').then((module) => ({ default: module.CruisingMap })),
);

function MapPlaceholder({ unavailable = false }: { unavailable?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-[26rem] items-center justify-center bg-surface-container px-6 text-center text-sm text-muted-foreground">
      {unavailable
        ? t('cruising.map.unavailable')
        : t('cruising.map.loading', 'Loading interactive map…')}
    </div>
  );
}

export function CruisingMapPanel(props: CruisingMapProps) {
  if (!isWebglSupported()) return <MapPlaceholder unavailable />;

  return (
    <ErrorBoundary section="cruising-map" fallback={<MapPlaceholder unavailable />}>
      <Suspense fallback={<MapPlaceholder />}>
        <LazyCruisingMap {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
