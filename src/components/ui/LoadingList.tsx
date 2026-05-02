import Box from '@mui/material/Box';
import { Skeleton } from '@/components/ui/skeleton';

interface LoadingListProps {
  count?: number;
  /** Min card width before the grid wraps. Mirrors how list pages compose their grids. */
  minItemWidth?: number;
  /** Approximate skeleton card height (matches typical card image + content). */
  itemHeight?: number;
}

/**
 * P6-2 — Skeleton grid for list pages (Venues, Events, News, Marketplace, …).
 * Renders {count} placeholder cards in the same fluid grid the real content
 * uses, so the layout doesn't jump when data arrives.
 */
export function LoadingList({
  count = 12,
  minItemWidth = 280,
  itemHeight = 280,
}: LoadingListProps) {
  return (
    <Box
      role="status"
      aria-live="polite"
      aria-label="Loading"
      sx={{
        display: 'grid',
        gap: 3,
        gridTemplateColumns: `repeat(auto-fill, minmax(${minItemWidth}px, 1fr))`,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          className="w-full"
          style={{ height: itemHeight }}
        />
      ))}
    </Box>
  );
}
