import * as React from 'react';

/**
 * Resolves the active column count for a responsive grid from a set of
 * min-width breakpoints, updating on resize. Split out of VirtualizedGrid so
 * that component file only exports components (react-refresh/only-export-components).
 *
 * `breakpoints` must mirror the Tailwind breakpoint column counts of the grid's
 * row className; pass the same breakpoints to VirtualizedGrid's `columns`.
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
