import { useTranslation } from 'react-i18next';
import { TrackLoader } from '@/components/transit/TrackLoader';

interface MapResultsPillProps {
  showResultCount: boolean;
  isFetching: boolean;
  isCounterStale: boolean;
  inBoundsCount: number;
}

/**
 * Fetching indicator + "N results in view" pill. Sits above MapLibre's
 * bottom-right AttributionControl (~24px tall); bottom: 40 keeps it clear of
 * the © Protomaps © OSM text.
 */
export function MapResultsPill({
  showResultCount,
  isFetching,
  isCounterStale,
  inBoundsCount,
}: MapResultsPillProps) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute z-10 flex items-center gap-1.5 rounded-element bg-card px-4 py-1.5 pointer-events-none transition-opacity duration-fast shadow-soft"
      style={{
        bottom: 40,
        right: 8,
        opacity:
          (showResultCount && (isFetching || isCounterStale || inBoundsCount > 0)) ||
          (!showResultCount && (isFetching || isCounterStale))
            ? 1
            : 0,
      }}
    >
      {(isFetching || isCounterStale) && <TrackLoader size={12} />}
      <span className="text-xs text-muted-foreground">
        {isFetching || isCounterStale
          ? t('map.canvas.loadingEllipsis', { defaultValue: 'Loading...' })
          : showResultCount
            ? t('map.canvas.resultsInView', {
                defaultValue: '{{count}} results in view',
                count: inBoundsCount,
              })
            : ''}
      </span>
    </div>
  );
}
