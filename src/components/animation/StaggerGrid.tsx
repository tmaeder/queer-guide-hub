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
}

/**
 * Wraps a grid of direct children and staggers their entrance animation.
 * Children are wrapped in motion.div so the parent's variant cascade reaches them.
 * Layout + styling of children is preserved via display: contents.
 */
export const StaggerGrid: React.FC<StaggerGridProps> = ({
  children,
  stagger = staggerTokens.normal,
  className,
  style,
}) => {
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
      {React.Children.map(children, (child, i) =>
        React.isValidElement(child) ? (
          <motion.div
            key={(child.key as React.Key | null | undefined) ?? i}
            variants={staggerItem}
          >
            {child}
          </motion.div>
        ) : (
          child
        ),
      )}
    </motion.div>
  );
};
