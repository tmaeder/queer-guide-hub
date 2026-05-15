import React from 'react';
import { motion, type Variants } from 'motion/react';
import { staggerContainerVariants, staggerItem } from '@/lib/motion';
import { stagger as staggerTokens } from '@/lib/animation';

interface StaggerGridProps {
  children: React.ReactNode;
  stagger?: number;
  /** @deprecated motion cascades via variants; prop kept for source compat */
  childSelector?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Per-child class applied to each motion item wrapper. Either a single string
   *  for all items, or a function receiving the child index. */
  itemClassName?: string | ((index: number) => string);
}

/**
 * Wraps a grid of direct children and staggers their entrance animation.
 * Children are wrapped in motion.div so the parent's variant cascade reaches them.
 * Layout + styling of children is preserved via display: contents.
 */
export const StaggerGrid = ({
  children,
  stagger = staggerTokens.normal,
  className,
  style,
  itemClassName,
}: StaggerGridProps) => {
  const variants: Variants = React.useMemo(
    () => staggerContainerVariants(stagger),
    [stagger],
  );

  return (
    <motion.div
      className={className}
      style={style}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.05, margin: '0px 0px -20px 0px' }}
    >
      {React.Children.map(children, (child, i) => {
        if (!React.isValidElement(child)) return child;
        const itemCls =
          typeof itemClassName === 'function' ? itemClassName(i) : itemClassName;
        return (
          <motion.div
            key={(child.key as React.Key | null | undefined) ?? i}
            variants={staggerItem}
            className={itemCls}
          >
            {child}
          </motion.div>
        );
      })}
    </motion.div>
  );
};
