import React from 'react';
import { useEntranceAnimation } from './useEntranceAnimation';

interface StaggerGridProps {
  children: React.ReactNode;
  stagger?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Per-child class applied to each item wrapper. Either a single string
   *  for all items, or a function receiving the child index. */
  itemClassName?: string | ((index: number) => string);
}

/**
 * A list arrives as a list: children settle in sequence, with the total delay
 * capped by the shared entrance hook. Content stays visible until the effect
 * begins and reduced-motion users receive the final state immediately.
 */
export const StaggerGrid = ({
  children,
  stagger,
  className,
  style,
  itemClassName,
}: StaggerGridProps) => {
  const ref = useEntranceAnimation<HTMLDivElement>({ children: true, stagger });
  return (
    <div ref={ref} className={className} style={style} data-motion="stagger">
      {React.Children.map(children, (child, i) => {
        if (!React.isValidElement(child)) return child;
        const itemCls = typeof itemClassName === 'function' ? itemClassName(i) : itemClassName;
        if (!itemCls) return child;
        return (
          <div key={(child.key as React.Key | null | undefined) ?? i} className={itemCls}>
            {child}
          </div>
        );
      })}
    </div>
  );
};
