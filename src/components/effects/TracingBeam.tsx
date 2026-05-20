import * as React from 'react';
import { cn } from '@/lib/utils';

interface TracingBeamProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Aceternity TracingBeam — gutted 2026-05-19. Scroll-bound SVG trail
 * removed; renders children in a plain relative wrapper.
 */
export function TracingBeam({ children, className }: TracingBeamProps) {
  return <div className={cn('relative w-full', className)}>{children}</div>;
}
