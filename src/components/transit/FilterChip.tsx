import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The design system's fourth button treatment — "chip (smaller, same border)"
 * — which the foundation spec lists but nothing ever built, so every filter
 * surface in the app hand-rolls its own.
 *
 * A chip FILLS on hover; it never lifts. The hard rule is that a surface fills
 * ink or casts the hard shadow, never both, and a chip is too small to carry a
 * 6px offset shadow legibly.
 *
 * Forwards its ref and any extra props to the <button>. That is load-bearing,
 * not politeness: Radix `<PopoverTrigger asChild>` and `<DropdownMenuTrigger
 * asChild>` clone their child with a ref plus aria-expanded / aria-haspopup /
 * data-state / onKeyDown. A chip that swallowed them rendered a popover that
 * never opened and announced nothing, which is exactly why
 * MarketplaceControlBar kept its own private copy of this component instead of
 * using it.
 */
export const FilterChip = React.forwardRef<
  HTMLButtonElement,
  {
    active: boolean;
    label: React.ReactNode;
    className?: string;
  } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>
>(function FilterChip({ active, label, className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 border-2 border-foreground px-2.5 text-13 font-bold',
        'transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'bg-foreground text-background'
          : 'bg-background text-foreground hover:bg-foreground hover:text-background',
        className,
      )}
      {...rest}
    >
      {label}
    </button>
  );
});
