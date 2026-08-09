import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  // Subway-map: a badge is a stamped chip — squared, 2px ink border, flat
  // fill. The border is what border-gates a track-colour fill (WCAG 1.4.11,
  // see tokenContrast.test.ts), so it belongs in the BASE, not per-variant.
  'inline-flex items-center rounded-badge border-2 border-foreground px-2 py-0.5 text-xs2 font-bold uppercase tracking-tight transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-foreground text-background',
        // Over-image chip. 131 call sites across 76 files — the single
        // highest-leverage line here. Stays a translucent plate so it is
        // legible on a photograph, but takes the ink border like the rest.
        outline: 'bg-background/85 backdrop-blur-sm text-foreground hover:bg-background',
        soft: 'bg-background text-foreground',
        // Pink track chip. INK type: paper-on-pink measures 3.43:1 and a
        // badge is 11px, nowhere near the large-text threshold.
        ink: 'bg-track-pink text-foreground',
        // Legacy alias.
        secondary: 'bg-surface-container text-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants };
