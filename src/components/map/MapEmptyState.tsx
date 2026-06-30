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
  if (!visible) return null;
  return (
    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 flex justify-center px-4 pointer-events-none">
      <p className="max-w-xs text-center text-sm text-muted-foreground bg-background/85 border border-border rounded-element px-4 py-2">
        {filters.openNow
          ? 'Nothing open right now in view — turn off Open now or try later.'
          : filters.dateRange
            ? 'No events in this time range here — widen the dates or pan out.'
            : filters.search
              ? `No matches for "${filters.search}" here — clear search or pan out.`
              : 'No spots here yet — pan, zoom out, or put one on the map.'}
      </p>
    </div>
  );
}
