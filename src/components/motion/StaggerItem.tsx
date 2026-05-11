import React from 'react';
import { motion, type Variants } from 'motion/react';
import { staggerItem } from '@/lib/motion';

interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
  variants?: Variants;
  as?: 'div' | 'li' | 'article' | 'section' | 'span';
}

/**
 * Child of <StaggerContainer> — inherits the parent's visibility cascade.
 */
export const StaggerItem = ({
  children,
  className,
  variants = staggerItem,
  as = 'div',
}: StaggerItemProps) => {
  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag className={className} variants={variants}>
      {children}
    </MotionTag>
  );
};

export default StaggerItem;
