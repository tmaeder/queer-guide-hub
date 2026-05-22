import React from 'react';

interface StaggerGridProps {
  children: React.ReactNode;
  /** Kept for API compatibility — no longer staggers entrance. */
  stagger?: number;
  /** @deprecated kept for source compatibility. */
  childSelector?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Per-child class applied to each item wrapper. Either a single string
   *  for all items, or a function receiving the child index. */
  itemClassName?: string | ((index: number) => string);
}

/**
 * Passthrough grid container retained for API compatibility across 10 call sites.
 *
 * Originally a `motion/react` IntersectionObserver staggered fade-in. Removed
 * 2026-05-21 (R1 design review): initial-opacity-0 left content invisible
 * until scrolled, violating CLAUDE.md "Motion: functional only". The wrapper
 * now renders children directly (wrapped in itemClassName when provided),
 * no animation.
 */
export const StaggerGrid = ({
  children,
  className,
  style,
  itemClassName,
}: StaggerGridProps) => (
  <div className={className} style={style}>
    {React.Children.map(children, (child, i) => {
      if (!React.isValidElement(child)) return child;
      const itemCls =
        typeof itemClassName === 'function' ? itemClassName(i) : itemClassName;
      if (!itemCls) return child;
      return (
        <div key={(child.key as React.Key | null | undefined) ?? i} className={itemCls}>
          {child}
        </div>
      );
    })}
  </div>
);
