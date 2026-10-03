import React from 'react';
import type { RevealDirection } from '@/lib/motion';
import { useEntranceAnimation } from './useEntranceAnimation';

interface ScrollRevealProps {
  children: React.ReactNode;
  direction?: RevealDirection;
  delay?: number;
  duration?: number;
  className?: string;
  component?: React.ElementType;
}

/**
 * Progressive scroll entrance. Content remains visible by default and is
 * animated only after the browser confirms it is in view, so observation or
 * JavaScript failure can never leave a section hidden.
 */
export const ScrollReveal = ({
  children,
  direction = 'up',
  delay = 0,
  duration,
  className,
  component = 'div',
}: ScrollRevealProps) => {
  const Tag = component;
  const ref = useEntranceAnimation<HTMLElement>({ direction, delay, duration });
  return (
    <Tag ref={ref} className={className} data-motion="reveal">
      {children}
    </Tag>
  );
};
