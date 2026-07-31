import { type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
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
}: DataTableEmptyStateProps) {
  if (isLoading) {
    return (
      <div className="p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-4 border-b border-border">
            <Skeleton className="h-5 w-5 rounded-badge" />
            {Array.from({ length: Math.min(columnCount, 5) }).map((_, j) => (
              <Skeleton key={j} className="h-5" style={{ width: j === 0 ? 180 : 100 }} />
            ))}
          </div>
        ))}
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
