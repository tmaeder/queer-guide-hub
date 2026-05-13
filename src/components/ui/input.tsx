import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.ComponentProps<'input'>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-md border border-input bg-background px-3.5 py-2 text-base md:text-sm text-foreground shadow-sm',
        'placeholder:text-muted-foreground',
        'transition-[border-color,box-shadow] duration-200 ease-out',
        'focus:outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/15',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
