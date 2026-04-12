import React from 'react';
import { motion, type Variants } from 'motion/react';
import { springs, defaultViewport, type RevealDirection } from '@/lib/motion';
import { distance } from '@/lib/animation';

interface SlideInProps {
  children: React.ReactNode;
  direction?: RevealDirection;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'aside' | 'nav';
  once?: boolean;
  amount?: number;
}

const largeVariants: Record<RevealDirection, Variants> = {
  up: {
    hidden: { opacity: 0, y: distance.lg },
    visible: { opacity: 1, y: 0 },
  },
  down: {
    hidden: { opacity: 0, y: -distance.lg },
    visible: { opacity: 1, y: 0 },
  },
  left: {
    hidden: { opacity: 0, x: -distance.lg },
    visible: { opacity: 1, x: 0 },
  },
  right: {
    hidden: { opacity: 0, x: distance.lg },
    visible: { opacity: 1, x: 0 },
  },
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
};

/**
 * Scroll-triggered reveal with a longer travel distance — for drawers,
 * hero sections, and larger panels.
 */
export const SlideIn: React.FC<SlideInProps> = ({
  children,
  direction = 'up',
  delay = 0,
  className,
  as = 'div',
  once = true,
  amount = defaultViewport.amount,
}) => {
  const base = largeVariants[direction];
  const variants: Variants = React.useMemo(
    () => ({
      hidden: base.hidden,
      visible: {
        ...(base.visible as object),
        transition: { ...springs.soft, delay },
      },
    }),
    [base, delay],
  );

  const MotionTag = motion[as] as typeof motion.div;

  return (
    <MotionTag
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount, margin: defaultViewport.margin }}
    >
      {children}
    </MotionTag>
  );
};

export default SlideIn;
