import React from 'react';
import Box from '@mui/material/Box';
import { useScrollReveal } from '@/hooks/useScrollReveal';

type Direction = 'up' | 'down' | 'left' | 'right' | 'fade';

interface ScrollRevealProps {
  children: React.ReactNode;
  direction?: Direction;
  delay?: number;
  duration?: number;
  className?: string;
  component?: React.ElementType;
}

/**
 * Wrapper that reveals children with a CSS animation when scrolled into view.
 * Uses a shared IntersectionObserver for performance.
 */
export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  direction = 'up',
  delay = 0,
  duration,
  className,
  component = 'div',
}) => {
  const ref = useScrollReveal<HTMLDivElement>();

  return (
    <Box
      ref={ref}
      component={component}
      className={`scroll-reveal scroll-reveal--${direction} ${className ?? ''}`}
      sx={{
        ...(delay > 0 && { transitionDelay: `${delay}s`, animationDelay: `${delay}s` }),
        ...(duration != null && { '--sr-duration': `${duration}s` }),
      } as any}
    >
      {children}
    </Box>
  );
};
