import React from 'react';
import type { RevealDirection } from '@/lib/motion';

interface ScrollRevealProps {
  children: React.ReactNode;
  /** Kept for API compatibility — no longer applies a direction. */
  direction?: RevealDirection;
  /** Kept for API compatibility — no longer applies a delay. */
  delay?: number;
  /** Kept for API compatibility — no longer applies a duration. */
  duration?: number;
  className?: string;
  component?: React.ElementType;
}

/**
 * Passthrough wrapper retained for API compatibility across 19 call sites.
 *
 * Originally a `motion/react` IntersectionObserver fade-in. Removed
 * 2026-05-21 (R1 design review): the initial-opacity-0 state left content
 * invisible until scrolled into view, violating CLAUDE.md
 * "Motion: functional only" and breaking screenshot / no-JS / reduced-motion
 * paths. The wrapper now renders children directly with the passed
 * className/component, no animation.
 */
export const ScrollReveal = ({
  children,
  className,
  component = 'div',
}: ScrollRevealProps) => {
  const Tag = component;
  return <Tag className={className}>{children}</Tag>;
};
