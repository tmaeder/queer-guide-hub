import { type LucideIcon } from '@/components/icons';
import type { ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';

interface DataTableEmptyStateProps {
  isLoading: boolean;
  hasFilters: boolean;
  columnCount: number;
  /**
   * Plural noun for the rows that are missing, lowercase — "venues", "runs".
   * Renders through AdminEmpty as "No {noun} yet." Defaults to "results" so a
   * table that never passed copy still reads in the house voice.
   */
  noun?: string;
  /** Secondary line for the empty (non-filtered) state. */
  description?: string;
  /** Icon for the empty (non-filtered) state. Default Inbox. */
  icon?: LucideIcon;
  /** Optional primary action (e.g. a "New X" button), shown when not filtered. */
  action?: ReactNode;
  /** Clears the active filters, offered only while filtered. */
  onResetFilters?: () => void;
  selection?: boolean;
  error?: unknown;
  onRetry?: () => void;
  isRetrying?: boolean;
}

/**
 * Loading + empty rendering for the admin tables.
 *
 * The skeleton is table-shaped so it stays here; the empty branch delegates to
 * <AdminEmpty> so every admin table distinguishes "nothing exists yet" from
 * "your filters matched nothing" in one place.
 */
export function DataTableEmptyState({
  isLoading,
  hasFilters,
  columnCount,
  noun = 'results',
  description,
  icon,
  action,
  onResetFilters,
  selection = false,
  error,
  onRetry,
  isRetrying = false,
}: DataTableEmptyStateProps) {
  if (isLoading) {
    const fields = Math.max(1, Math.min(columnCount, 5));
    const layout =
      (selection ? '24px ' : '') +
      Array.from({ length: fields }, (_, index) =>
        index === 0 ? 'minmax(0,2fr)' : 'minmax(0,1fr)',
      ).join(' ');
    return (
      <div className="rounded-container bg-card p-4" role="status" aria-label="Loading records">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            data-testid="admin-loading-row"
            className="grid min-w-0 items-center gap-4 py-4"
            style={{ gridTemplateColumns: layout }}
          >
            {selection && <Skeleton className="size-6 rounded-badge" />}
            {Array.from({ length: fields }).map((_, column) => (
              <Skeleton key={column} className="h-4 min-w-0 w-full" />
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-4">
            <span>Could not load {noun}. Try again.</span>
            {onRetry && (
              <Button variant="outline" size="sm" loading={isRetrying} onClick={onRetry}>
                Retry
              </Button>
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <AdminEmpty
      noun={noun}
      filtered={hasFilters}
      onReset={onResetFilters}
      description={description}
      icon={icon}
      action={action}
    />
  );
}
