import { Skeleton } from '@/components/ui/skeleton';
import { EntityTile } from './EntityTile';
import type { EntityLayoutProps } from './layoutTypes';

/**
 * Image-forward responsive grid.
 *
 * Not virtualized: a database block is bounded by MAX_QUERY_LIMIT (48), well
 * under the ~48-row threshold where VirtualizedGrid starts paying for itself,
 * and window virtualization inside a document flow fights the surrounding prose.
 */
export function EntityGalleryLayout({ cards, isLoading }: EntityLayoutProps) {
  if (isLoading && cards.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-container" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <EntityTile key={card.docId} card={card} />
      ))}
    </div>
  );
}
