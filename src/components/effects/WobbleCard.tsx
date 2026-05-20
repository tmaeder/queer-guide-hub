import * as React from 'react';
import { cn } from '@/lib/utils';

interface WobbleCardProps extends React.HTMLAttributes<HTMLDivElement> {
  containerClassName?: string;
}

/**
 * Aceternity WobbleCard — gutted 2026-05-19. Mouse-follow rotation removed.
 * Now a plain container so existing call sites keep rendering.
 */
export function WobbleCard({ children, className, containerClassName, ...rest }: WobbleCardProps) {
  return (
    <div className={cn('relative', containerClassName)} {...rest}>
      <div className={cn('relative', className)}>{children}</div>
    </div>
  );
}
