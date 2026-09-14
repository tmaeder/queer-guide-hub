import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cohortLabel, isLowConfidence } from '@/lib/qualityQueue';
import type { ReviewQueueCohort } from '@/hooks/useReviewQueueCohorts';
import type { TriageFilters } from '@/hooks/useUnifiedTriageQueue';

const ENTITY_LABELS: Record<string, string> = {
  city: 'City',
  venue: 'Venue',
  village: 'Village',
  personality: 'Person',
  marketplace: 'Product',
};

interface QualityCohortBarProps {
  cohorts: ReviewQueueCohort[] | undefined;
  isLoading: boolean;
  filters: TriageFilters;
  onFiltersChange: (f: Partial<TriageFilters>) => void;
}

/**
 * The Quality queue is a dozen unrelated campaigns, not one list.
 *
 * A cohort is selected by pinning BOTH the queue key and the field, because
 * the field alone is ambiguous — `editorial_hook` is an open cohort on cities
 * AND on villages, and the search term matches the row title, which carries
 * the field but not the entity type.
 */
export function QualityCohortBar({
  cohorts,
  isLoading,
  filters,
  onFiltersChange,
}: QualityCohortBarProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-6 w-28 rounded-badge" />
        ))}
      </div>
    );
  }
  if (!cohorts || cohorts.length === 0) return null;

  const activeField = filters.search;
  const activeQueue = filters.queueTypes?.length === 1 ? filters.queueTypes[0] : null;

  function select(c: ReviewQueueCohort) {
    const isActive = activeField === c.field && activeQueue === c.queue_key;
    onFiltersChange(
      isActive
        ? { search: '', queueTypes: null, page: 1 }
        : { search: c.field, queueTypes: [c.queue_key], page: 1 },
    );
  }

  return (
    <div className="border-b px-4 py-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Layers className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">
          Campaigns — pick one pile, not the whole queue
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {cohorts.map((c) => {
          const isActive = activeField === c.field && activeQueue === c.queue_key;
          const gated = c.risk_gated > 0;
          const thin = isLowConfidence(c);
          return (
            <button
              key={`${c.entity_type}.${c.field}`}
              type="button"
              onClick={() => select(c)}
              aria-pressed={isActive}
              title={
                gated
                  ? `${c.risk_gated} of ${c.n} need an explicit safety confirmation to approve`
                  : undefined
              }
              className={cn(
                // min-h-6 is WCAG 2.5.8 (24px target), and it is EXPLICIT rather
                // than left to the computed box. `text-2xs` (14px line-height) +
                // `py-1` (8px) + 1px borders lands on exactly 24 — it passes, but
                // only just, and any later change to the type scale or the padding
                // silently drops it under the bar. axe measured the sibling
                // checkbox at 16px and failed it `target-size` (serious) on this
                // very route, so the gate is live here.
                'inline-flex items-center gap-1.5 rounded-badge border px-2 py-1 min-h-6',
                'text-2xs transition-colors',
                isActive
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-card text-foreground hover:bg-muted border-border-hairline',
              )}
            >
              <span className="font-medium">{cohortLabel(c.field)}</span>
              <span className={cn(isActive ? 'text-background/70' : 'text-muted-foreground')}>
                {ENTITY_LABELS[c.entity_type] ?? c.entity_type}
              </span>
              <span className="tabular-nums font-medium">{c.n.toLocaleString()}</span>
              {/* Glyph AND text, never colour alone (WCAG 1.4.1). */}
              {gated && (
                <span className="inline-flex items-center gap-0.5">
                  <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                  <span className="tabular-nums">{c.risk_gated}</span>
                  <span className="sr-only">
                    {c.risk_gated} rows need a safety confirmation before approval
                  </span>
                </span>
              )}
              {thin && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-3xs normal-case px-1 py-0',
                    isActive && 'border-background/40 text-background',
                  )}
                >
                  low conf
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
