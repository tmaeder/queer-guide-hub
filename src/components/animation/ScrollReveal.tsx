import React from 'react';
import { motion, type Variants } from 'motion/react';
import { variantByDirection, tweens, defaultViewport, type RevealDirection } from '@/lib/motion';

interface ScrollRevealProps {
  children: React.ReactNode;
  direction?: RevealDirection;
  delay?: number;
  duration?: number;
  className?: string;
  component?: React.ElementType;
}

const STATIC_TAGS: Record<string, keyof typeof motion> = {
  div: 'div',
  section: 'section',
  article: 'article',
  span: 'span',
  header: 'header',
  footer: 'footer',
  ul: 'ul',
  li: 'li',
};

/**
 * Reveals children with a scroll-triggered entrance animation.
 * Drop-in replacement for the old CSS-based ScrollReveal.
 */
export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  direction = 'up',
  delay = 0,
  duration,
  className,
  component = 'div',
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

  // Pick a static motion.<tag> for common elements to avoid motion.create cost
  const tagName = typeof component === 'string' ? component : 'div';
  const motionKey = STATIC_TAGS[tagName] ?? 'div';
  const MotionTag = motion[motionKey] as typeof motion.div;

  // Fallback: non-string `component` not supported as motion element here;
  // still render wrapped so children animate inside a motion.div.
  if (typeof component !== 'string') {
    const Wrapper = component;
    return (
      <motion.div
        className={className}
        variants={variants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: defaultViewport.amount, margin: defaultViewport.margin }}
      >
        <Wrapper>{children}</Wrapper>
      </motion.div>
    );
  }

  return (
    <MotionTag
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: defaultViewport.amount, margin: defaultViewport.margin }}
    >
      {children}
    </MotionTag>
  );
};
