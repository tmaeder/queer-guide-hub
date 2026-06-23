/**
 * FreshnessIndicator — tiny "updated 12s ago" stamp for a live widget.
 * Spins while fetching; turns destructive when data is stale beyond 2× the
 * widget's refetch interval. Reads straight off a useQuery result.
 */

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FreshnessIndicatorProps {
  dataUpdatedAt: number;
  isFetching: boolean;
  /** Refetch interval in ms; stale threshold is 2×. Defaults to 60s. */
  intervalMs?: number;
}

export function FreshnessIndicator({
  dataUpdatedAt,
  isFetching,
  intervalMs = 60_000,
}: FreshnessIndicatorProps) {
  // Re-render every 15s so the relative time stays current.
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  if (!dataUpdatedAt) return null;
  // eslint-disable-next-line react-hooks/purity -- time-relative staleness check; re-evaluated by the 15s interval tick, sub-second precision irrelevant.
  const stale = Date.now() - dataUpdatedAt > intervalMs * 2;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-3xs font-medium text-muted-foreground',
        stale && 'text-destructive',
      )}
      title={stale ? 'Data may be stale' : 'Auto-refreshing'}
    >
      <RefreshCw size={9} className={cn(isFetching && 'animate-spin')} aria-hidden />
      {isFetching ? 'updating…' : formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
    </span>
  );
}
