import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Loading affordances for the admin console.
 *
 * The rule, which admin had never applied consistently: a **skeleton** on first
 * load (nothing on screen yet, so show the shape that is coming), a **spinner**
 * only when refetching over content that is already rendered, and never bare
 * "Loading..." text — it collapses the layout and reads as a stuck page.
 */

/** Rows-and-columns placeholder for a table that has not loaded yet. */
export function AdminTableSkeleton({
  rows = 5,
  columns = 5,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn('p-4', className)} role="status" aria-label="Loading table">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-border py-4">
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={j} className="h-5" style={{ width: j === 0 ? 180 : 100 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Heading-plus-body placeholder for a card or panel. */
export function AdminCardSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('rounded-container border border-border p-6', className)}
      role="status"
      aria-label="Loading"
    >
      <Skeleton className="mb-4 h-6 w-48" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
        ))}
      </div>
    </div>
  );
}

/**
 * Small spinner for refetches over already-rendered content. Never use this as
 * a first-load state — reach for a skeleton so the layout does not jump.
 */
export function AdminInlineSpinner({
  className,
  label = 'Refreshing',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <Loader2
      size={14}
      className={cn('animate-spin text-muted-foreground', className)}
      role="status"
      aria-label={label}
    />
  );
}
