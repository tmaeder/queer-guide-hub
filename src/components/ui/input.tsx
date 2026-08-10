import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.ComponentProps<'input'>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-element px-4 py-2 text-base md:text-sm transition-all duration-fast',
        // Subway-map: a form field is an ink-bordered box on paper, like every
        // other surface in the system. This REPLACES the PASTE-UP inverted
        // plate (bg-inverse-surface + text-background), whose two halves were
        // coupled — a caller overriding only the background left near-white
        // type on a light surface at 1.09:1, which shipped and failed axe.
        // Ink-on-paper is the safe default: overriding the fill with any light
        // surface keeps the type readable.
        'border-2 border-foreground bg-background text-foreground placeholder:text-muted-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
