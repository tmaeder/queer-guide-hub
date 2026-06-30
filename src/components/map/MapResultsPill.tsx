import { Loader2 } from 'lucide-react';

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
  return (
    <div
      className="absolute z-10 flex items-center gap-1.5 rounded-full border border-border bg-background/85 px-4 py-1.5 pointer-events-none transition-opacity duration-200"
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
      {(isFetching || isCounterStale) && (
        <Loader2 className="h-3 w-3 animate-spin" aria-label="Loading" />
      )}
      <span className="text-xs text-muted-foreground">
        {isFetching || isCounterStale
          ? 'Loading...'
          : showResultCount
            ? `${inBoundsCount.toLocaleString()} results in view`
            : ''}
      </span>
    </div>
  );
}
