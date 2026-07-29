import { Skeleton } from '@/components/ui/skeleton';
import { toKanbanColumns } from '@/lib/databaseBlock/normalize';
import { EntityTile } from './EntityTile';
import type { EntityLayoutProps } from './layoutTypes';

/**
 * Read-only grouped columns.
 *
 * Deliberately NOT drag-and-drop. None of the eleven entity types has a
 * user-owned status column, so dropping a venue into another column would have
 * to mean `UPDATE venues.city` — editing real geography from a document layout.
 * Grouping is a lens over the data, not a mutation surface.
 */
export function EntityKanbanLayout({ cards, viewState, isLoading }: EntityLayoutProps) {
  if (isLoading && cards.length === 0) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-64 w-64 shrink-0 rounded-container" />
        ))}
      </div>
    );
  }

  const columns = toKanbanColumns(cards, viewState.groupByField);

  return (
    // Horizontal scroll is contained here so the page body never scrolls sideways.
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map((column) => (
        <section
          key={column.key}
          className="flex w-64 shrink-0 flex-col gap-2 border border-border bg-muted/40 rounded-container p-2"
          aria-label={column.label}
        >
          <header className="flex items-center justify-between gap-2 px-2 pt-1">
            <span className="text-2xs uppercase tracking-wide text-muted-foreground">
              {column.label}
            </span>
            <span className="text-2xs text-muted-foreground">{column.cards.length}</span>
          </header>
          <div className="flex flex-col gap-2">
            {column.cards.map((card) => (
              <EntityTile key={card.docId} card={card} variant="compact" />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
