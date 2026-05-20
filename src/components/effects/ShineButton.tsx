import * as React from 'react';
import { cn } from '@/lib/utils';

interface ShineButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

/**
 * Aceternity ShineButton — gutted 2026-05-19. Shimmer overlay removed.
 * Falls through to a plain monochrome button. Consumers should migrate
 * to <Button> from @/components/ui/button.
 */
export function ShineButton({ children, className, ...rest }: ShineButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center bg-foreground text-background px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
