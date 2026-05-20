import * as React from 'react';
import { cn } from '@/lib/utils';

interface HoverBorderGradientProps extends React.ComponentPropsWithoutRef<'button'> {
  containerClassName?: string;
  as?: React.ElementType;
  duration?: number;
  clockwise?: boolean;
}

/**
 * Aceternity HoverBorderGradient — gutted 2026-05-19. Rotating gradient
 * border replaced by a static monochrome border with hover state.
 */
export function HoverBorderGradient({
  children,
  className,
  containerClassName,
  as: Component = 'button',
  ...rest
}: HoverBorderGradientProps) {
  return (
    <Component
      className={cn(
        'relative inline-flex items-center justify-center border border-border text-foreground transition-colors hover:border-foreground',
        containerClassName,
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}
