import { Inbox } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface DataTableEmptyStateProps {
  isLoading: boolean;
  hasFilters: boolean;
  columnCount: number;
}

export function DataTableEmptyState({
  isLoading,
  hasFilters,
  columnCount,
}: DataTableEmptyStateProps) {
  if (isLoading) {
    return (
      <div className="p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-3 border-b border-border">
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
    <div className="flex flex-col items-center justify-center py-16 px-8">
      <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
      <h6 className="text-base font-semibold mb-1">No results found</h6>
      <p className="text-sm text-muted-foreground">
        {hasFilters ? 'Try adjusting your filters or search terms.' : 'No data available yet.'}
      </p>
    </div>
  );
}
