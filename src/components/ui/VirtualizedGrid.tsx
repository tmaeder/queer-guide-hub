import * as React from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';

/**
 * Window-scroll virtualization for the infinite-scroll grids. The browse
 * surfaces accumulate every fetched row into the DOM (hundreds of cards with
 * images after a few pages); this renders only the visible rows.
 *
 * Items are chunked into ROWS of `columns` and each virtual row renders the
 * surface's existing grid classes — so the visual grid (and its Tailwind
 * breakpoints) stays exactly as designed. `columns` must mirror the breakpoint
 * column counts of `rowClassName`; pass it from useGridColumns with the same
 * breakpoints.
 *
 * Below `virtualizeAfter` items it renders the plain grid (no virtualization
 * overhead for a page-one result set, and SEO/a11y snapshots stay identical).
 */

export interface GridBreakpoint {
  /** min-width media query in px; use 0 for the base column count. */
  minWidth: number;
  columns: number;
}

export function useGridColumns(breakpoints: GridBreakpoint[]): number {
  const resolve = React.useCallback(() => {
    if (typeof window === 'undefined') return breakpoints[0]?.columns ?? 1;
    let cols = 1;
    for (const bp of breakpoints) {
      if (window.matchMedia(`(min-width: ${bp.minWidth}px)`).matches) cols = bp.columns;
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- breakpoints are static per call site
  }, []);
  const [columns, setColumns] = React.useState(resolve);
  React.useEffect(() => {
    const handler = () => setColumns(resolve());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [resolve]);
  return columns;
}

interface VirtualizedGridProps<T> {
  items: T[];
  columns: number;
  /** The surface's existing grid classes, applied per virtual row. */
  rowClassName: string;
  /** Estimated row height in px (card height incl. gap) — self-corrects via measureElement. */
  estimateRowHeight: number;
  overscan?: number;
  /** Render the plain grid below this item count. */
  virtualizeAfter?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  itemKey: (item: T, index: number) => React.Key;
}

export function VirtualizedGrid<T>({
  items,
  columns,
  rowClassName,
  estimateRowHeight,
  overscan = 4,
  virtualizeAfter = 48,
  renderItem,
  itemKey,
}: VirtualizedGridProps<T>) {
  const [scrollMargin, setScrollMargin] = React.useState(0);
  const listRef = React.useCallback((el: HTMLDivElement | null) => {
    if (el) setScrollMargin(el.offsetTop);
  }, []);
  const rowCount = Math.ceil(items.length / Math.max(1, columns));

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => estimateRowHeight,
    overscan,
    scrollMargin,
  });

  if (items.length <= virtualizeAfter) {
    return (
      <div className={rowClassName}>
        {items.map((item, i) => (
          <React.Fragment key={itemKey(item, i)}>{renderItem(item, i)}</React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <div ref={listRef}>
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => {
          const start = vRow.index * columns;
          const rowItems = items.slice(start, start + columns);
          return (
            <div
              key={vRow.key}
              ref={virtualizer.measureElement}
              data-index={vRow.index}
              className={rowClassName}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {rowItems.map((item, i) => (
                <React.Fragment key={itemKey(item, start + i)}>
                  {renderItem(item, start + i)}
                </React.Fragment>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
