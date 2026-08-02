import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.ComponentProps<'input'>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-element rounded-b-none bg-surface-container px-4.5 py-2 text-base md:text-sm text-foreground transition-all duration-200',
        // Ruled field, not a boxed outline: a printed form has a line you write
        // ON. The tonal fill alone measures 1.17:1 against the page — nowhere
        // near the 3:1 WCAG 1.4.11 wants for a control boundary — so the rule is
        // load-bearing, not decoration. At --foreground it is 19.78:1.
        'border-b-2 border-foreground',
        'placeholder:text-muted-foreground',
        'focus:outline-none focus:ring-2 focus:ring-foreground/15',
        'hover:bg-surface-container-high',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
