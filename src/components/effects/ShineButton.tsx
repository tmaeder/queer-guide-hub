import * as React from 'react';
import { cn } from '@/lib/utils';

interface ShineButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

/**
 * Solid B&W CTA with a single diagonal shine sweep on hover.
 * Pairs the new shadow-aceternity tokens for soft depth.
 */
export function ShineButton({ className, children, ...props }: ShineButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'shine-on-hover inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold tracking-tight shadow-[var(--shadow-aceternity-sm)] transition-all duration-200 hover:shadow-[var(--shadow-aceternity)] hover:-translate-y-px active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
