import { useTranslation } from 'react-i18next';
import type { ExploreMapFilters } from '@/hooks/useExploreMapData';

interface MapEmptyStateProps {
  /** Parent-computed gate: MapShell mode, ready, not fetching, zero in view. */
  visible: boolean;
  filters: ExploreMapFilters;
}

/**
 * Queer-voiced empty state (MapShell only). Shows when the area has no points
 * and we're not mid-fetch — warmer than a hidden zero pill.
 */
export function MapEmptyState({ visible, filters }: MapEmptyStateProps) {
  const { t } = useTranslation();
  if (!visible) return null;
  const message = filters.openNow
    ? t('map.canvas.emptyOpenNow', {
        defaultValue: 'Nothing open right now in view — turn off Open now or try later.',
      })
    : filters.dateRange
      ? t('map.canvas.emptyTimeRange', {
          defaultValue: 'No events in this time range here — widen the dates or pan out.',
        })
      : filters.search
        ? t('map.canvas.emptySearch', {
            defaultValue: 'No matches for "{{query}}" here — clear search or pan out.',
            query: filters.search,
          })
        : t('map.canvas.emptyDefault', {
            defaultValue: 'No spots here yet — pan, zoom out, or put one on the map.',
          });
  return (
    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 flex justify-center px-4 pointer-events-none">
      <p
        role="status"
        className="max-w-xs text-center text-sm text-muted-foreground bg-background/85 border border-border rounded-element px-4 py-2"
      >
        {message}
      </p>
    </div>
  );
}
