import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'group relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-element text-sm font-semibold tracking-tight ring-offset-background transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Solid foreground CTA with subtle lift on hover.
        default: 'bg-foreground text-background hover:opacity-90',
        // Plate, not an outline. Fills to solid ink on hover.
        outline:
          'bg-surface-container-high text-foreground hover:bg-foreground hover:text-background',
        // No chrome until hover — useful in headers / menus.
        ghost: 'bg-transparent text-foreground hover:bg-muted',
        // Inline link styling.
        link: 'bg-transparent text-foreground underline underline-offset-4 hover:opacity-70',
        // Single chromatic exception carrying MEANING: irreversible actions.
        // Ink never competes with this — see the doctrine in src/index.css.
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
        // Flat surface plate. Was `bg-muted` + a hairline border; the border is
        // gone and the fill carries the edge.
        soft: 'bg-surface-container text-foreground hover:bg-surface-container-high',
        // PASTE-UP: primary conversion action, printed in the first drum.
        // Pink is the one ink that is light in BOTH modes, so its type stays
        // near-black either way (5.29:1 light / 6.61:1 dark) — the button does
        // not have to flip its own foreground with the theme.
        //
        // The `.ink-bleed` press feedback is deliberately NOT baked in here.
        // `brand` is used across src/components/trips/**, and CLAUDE.md keeps
        // travel content motion-free because it is safety-adjacent; baking
        // motion into a variant would smuggle it onto every one of those
        // screens. Opt in per call site with className="ink-bleed".
        accent: 'bg-ink-pink text-ink-pink-foreground hover:opacity-90',
        // The second drum. Blue is DARK on paper and LIGHT on a black page, so
        // its foreground token flips with the mode — hence the token rather
        // than a literal.
        brand: 'bg-ink-blue text-ink-blue-foreground hover:opacity-90',
        // Legacy alias retained for compat (2026-05-19) — collapses to
        // `default`. Use variant="default".
        secondary: 'bg-foreground text-background hover:opacity-85',
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
        <Loader2 className="absolute left-1/2 top-1/2 -ml-2 -mt-2 h-4 w-4 animate-spin" />
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
