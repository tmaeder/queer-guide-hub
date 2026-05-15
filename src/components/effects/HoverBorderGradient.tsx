import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface HoverBorderGradientProps extends React.ComponentPropsWithoutRef<'button'> {
  containerClassName?: string;
  duration?: number;
  asChild?: boolean;
  children: React.ReactNode;
}

/**
 * Aceternity-style hover-border-gradient — rotating monochrome conic gradient
 * border that only spins on hover. Inner content sits on a solid surface so
 * only the 1-2px ring shows the motion.
 */
export function HoverBorderGradient({
  className,
  containerClassName,
  duration = 2,
  children,
  ...props
}: HoverBorderGradientProps) {
  const [hovered, setHovered] = React.useState(false);
  const reduced = useReducedMotion();
  const active = hovered && !reduced;

  return (
    <button
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className={cn(
        'group relative inline-flex items-center justify-center rounded-full p-px overflow-hidden focus:outline-none',
        containerClassName,
      )}
      {...props}
    >
      <motion.span
        aria-hidden="true"
        className="absolute inset-0 rounded-full"
        animate={
          active
            ? {
                background: [
                  'conic-gradient(from 0deg at 50% 50%, hsl(var(--foreground) / 0) 0%, hsl(var(--foreground) / 0.8) 25%, hsl(var(--foreground) / 0) 50%, hsl(var(--foreground) / 0) 100%)',
                  'conic-gradient(from 360deg at 50% 50%, hsl(var(--foreground) / 0) 0%, hsl(var(--foreground) / 0.8) 25%, hsl(var(--foreground) / 0) 50%, hsl(var(--foreground) / 0) 100%)',
                ],
              }
            : { background: 'conic-gradient(from 0deg at 50% 50%, hsl(var(--foreground) / 0.20) 0%, hsl(var(--foreground) / 0.20) 100%)' }
        }
        transition={{ duration, repeat: active ? Infinity : 0, ease: 'linear' }}
      />
      <span
        className={cn(
          'relative inline-flex items-center justify-center rounded-full bg-background text-foreground px-5 py-2 text-sm font-medium transition-colors',
          className,
        )}
      >
        {children}
      </span>
    </button>
  );
}
