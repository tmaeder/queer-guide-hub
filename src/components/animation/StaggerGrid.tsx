import React from 'react';
import Box from '@mui/material/Box';
import { useStaggerReveal } from '@/hooks/useStaggerReveal';

interface StaggerGridProps {
  children: React.ReactNode;
  stagger?: number;
  childSelector?: string;
  className?: string;
  sx?: Record<string, any>;
}

/**
 * Wraps a grid of children and staggers their entrance animation.
 * Drop-in wrapper — does not alter layout or styling of children.
 */
export const StaggerGrid: React.FC<StaggerGridProps> = ({
  children,
  stagger,
  childSelector,
  className,
  sx,
}) => {
  const ref = useStaggerReveal<HTMLDivElement>({ stagger, childSelector });

  return (
    <Box ref={ref} className={className} sx={sx}>
      {children}
    </Box>
  );
};
