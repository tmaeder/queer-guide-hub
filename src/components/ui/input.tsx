import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.ComponentProps<'input'>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-element px-4.5 py-2 text-base md:text-sm transition-all duration-200',
        // PASTE-UP: an INVERTED PLATE, not a box and not a rule. --inverse-surface
        // flips with the theme on its own (near-black on paper, near-white on a
        // dark page) so one class is correct in both modes. Measured 19.78:1
        // light / 18.11:1 dark against the page — a light fill managed 1.17:1,
        // which is why the field could not simply lose its outline.
        'bg-inverse-surface text-background placeholder:text-background/70',
        'focus:outline-none focus:ring-2 focus:ring-spot/40',
        'hover:opacity-95',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
