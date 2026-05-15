import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.ComponentProps<'input'>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-element border border-input bg-background px-3.5 py-2 text-base md:text-sm text-foreground transition-all duration-200',
        'placeholder:text-muted-foreground',
        'focus:outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/15',
        'hover:border-foreground/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
