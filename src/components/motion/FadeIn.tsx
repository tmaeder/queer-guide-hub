import React from 'react';
import { motion, type Variants } from 'motion/react';
import {
  variantByDirection,
  tweens,
  defaultViewport,
  type RevealDirection,
} from '@/lib/motion';

interface FadeInProps {
  children: React.ReactNode;
  direction?: RevealDirection;
  delay?: number;
  duration?: number;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'span' | 'ul' | 'li' | 'header' | 'footer';
  once?: boolean;
  amount?: number;
}

/**
 * Scroll-triggered single-element reveal.
 * Uses motion's whileInView for one-shot entrance animations.
 */
export const FadeIn = ({
  children,
  direction = 'up',
  delay = 0,
  duration,
  className,
  as = 'div',
  once = true,
  amount = defaultViewport.amount,
}) => {
  const base = variantByDirection[direction];
  const variants: Variants = React.useMemo(() => {
    const revealTransition = {
      ...tweens.reveal,
      ...(duration != null ? { duration } : {}),
      ...(delay > 0 ? { delay } : {}),
    };
    return {
      hidden: base.hidden,
      visible: {
        ...(base.visible as object),
        transition: revealTransition,
      },
    };
  }, [base, delay, duration]);

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

export default FadeIn;
