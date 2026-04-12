import React from 'react';
import { motion, type Variants } from 'motion/react';
import { staggerContainerVariants, defaultViewport } from '@/lib/motion';
import { stagger as staggerTokens } from '@/lib/animation';

interface StaggerContainerProps {
  children: React.ReactNode;
  step?: number;
  delayChildren?: number;
  className?: string;
  as?: 'div' | 'section' | 'ul' | 'ol';
  once?: boolean;
  amount?: number;
  style?: React.CSSProperties;
}

/**
 * Parent container whose `visible` variant cascades a staggered reveal
 * to children using motion's variant propagation.
 */
export const StaggerContainer = React.forwardRef<HTMLDivElement, StaggerContainerProps>(
  (
    {
      children,
      step = staggerTokens.normal,
      delayChildren = 0,
      className,
      as = 'div',
      once = true,
      amount = 0.05,
      style,
    },
    ref,
  ) => {
    const variants: Variants = React.useMemo(
      () => staggerContainerVariants(step, delayChildren),
      [step, delayChildren],
    );

    const MotionTag = motion[as] as typeof motion.div;

    return (
      <MotionTag
        ref={ref}
        className={className}
        style={style}
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once, amount, margin: '0px 0px -20px 0px' }}
      >
        {children}
      </MotionTag>
    );
  },
);

StaggerContainer.displayName = 'StaggerContainer';

export default StaggerContainer;
