import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface DataTableEmptyStateProps {
  isLoading: boolean;
  hasFilters: boolean;
  columnCount: number;
  /** Title for the empty (non-filtered) state. Default "No results found". */
  title?: string;
  /** Secondary line for the empty (non-filtered) state. */
  description?: string;
  /** Icon for the empty (non-filtered) state. Default Inbox. */
  icon?: LucideIcon;
  /** Optional primary action (e.g. a "New X" button), shown when not filtered. */
  action?: ReactNode;
}

export function DataTableEmptyState({
  isLoading,
  hasFilters,
  columnCount,
  title,
  description,
  icon: Icon = Inbox,
  action,
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
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <Icon className="h-12 w-12 text-muted-foreground mb-4" />
      <h6 className="text-base font-semibold mb-1">
        {hasFilters ? 'No results found' : title ?? 'No results found'}
      </h6>
      <p className="text-sm text-muted-foreground">
        {hasFilters
          ? 'Try adjusting your filters or search terms.'
          : description ?? 'No data available yet.'}
      </p>
      {!hasFilters && action && <div className="mt-4">{action}</div>}
    </div>
  );
}
