import * as React from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'group relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-element text-sm font-semibold tracking-tight ring-offset-background transition-all duration-fast ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Subway-map primary: solid ink, squared, 2px ink border so it sits
        // flush next to `outline` in a row.
        default: 'border-2 border-foreground bg-foreground text-background font-bold hover:opacity-90',
        // Secondary: 2px ink border on paper. Hover FILLS ink — a button
        // fills or lifts, never both (design-system hard rule).
        outline:
          'border-2 border-foreground bg-background text-foreground font-bold hover:bg-foreground hover:text-background',
        // No chrome until hover — useful in headers / menus.
        ghost: 'bg-transparent text-foreground hover:bg-muted',
        // Inline link styling.
        link: 'bg-transparent text-foreground underline underline-offset-4 hover:opacity-70',
        // Single chromatic exception carrying MEANING: irreversible actions.
        // Track colors never compete with this — see src/index.css.
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
        // Flat surface plate, borderless — dense/quiet contexts (admin rows).
        soft: 'bg-surface-container text-foreground hover:bg-surface-container-high',
        // Pink track conversion action. INK type, not paper: measured
        // paper-on-pink at 3.43:1, which fails AA for 14px bold (large text
        // starts at 18.66px bold). Ink-on-pink is 5.22:1. The 2px ink border
        // gates the fill for WCAG 1.4.11.
        //
        // The `.ink-bleed` press feedback is deliberately NOT baked in here.
        // `accent`/`brand` are used across src/components/trips/**, and
        // CLAUDE.md keeps travel content motion-free because it is
        // safety-adjacent. Opt in per call site with className="ink-bleed".
        accent: 'border-2 border-foreground bg-track-pink text-foreground font-bold hover:opacity-90',
        // Blue track. Ink type (paper-on-blue fails 3:1 — see tokenContrast).
        brand: 'border-2 border-foreground bg-track-blue text-foreground font-bold hover:opacity-90',
        // Legacy alias retained for compat (2026-05-19) — collapses to
        // `default`. Use variant="default".
        secondary: 'border-2 border-foreground bg-foreground text-background font-bold hover:opacity-85',
      },
      size: {
        default: 'h-10 px-6',
        sm: 'h-9 px-4 text-xs',
        lg: 'h-12 px-8 text-sm',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref,
  ) => {
    // `brand` is no longer deprecated — the PASTE-UP rebrand gave it the second
    // ink drum, so it is a real variant again. `secondary` is still a
    // pass-through alias for `default`.
    if (import.meta.env?.DEV && variant === 'secondary') {
      console.warn(
        `[Button] variant="secondary" is deprecated (2026-05-19) and collapses to "default". Update to variant="default" before the next major release.`,
      );
    }
    const Comp = asChild ? Slot : 'button';
    const isInert = disabled || loading;
    const content = loading ? (
      <span className="relative inline-flex items-center">
        <span className="invisible inline-flex items-center">{children}</span>
        {/* The design system's Loading Animation spec: "A closed loop, drawn as
            track. Replaces the spinner everywhere." Its primary example is
            exactly this — a track loop on an ink button. Changing it here
            rather than at each call site is what makes the swap reach every
            loading button at once. */}
        <TrackLoader size={16} className="absolute left-1/2 top-1/2 -ml-2 -mt-2" />
      </span>
    ) : (
      children
    );
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isInert}
        aria-busy={loading || undefined}
        {...props}
      >
        {content}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
