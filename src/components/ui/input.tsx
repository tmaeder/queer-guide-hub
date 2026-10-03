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
        // The tonal well supplies depth; the contrasting edge remains because
        // labels and placeholders do not persistently identify the hit area.
        'border border-input bg-surface-container text-foreground placeholder:text-muted-foreground shadow-soft',
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
