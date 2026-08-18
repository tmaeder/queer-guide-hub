import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  // Subway-map: a badge is a stamped chip — 12px corners, a 1px ink ring,
  // flat fill. The ring is what border-gates a track-colour fill (WCAG
  // 1.4.11, see tokenContrast.test.ts), so it belongs in the BASE, not
  // per-variant — and it is why a badge keeps an edge when cards lost
  // theirs: a card frame is decoration, a track fill's ring is not.
  //
  // `rounded-element` (12px) rather than `rounded-badge` (9px): the design
  // system's badge rank is for count marks and swatches; this component is
  // the chip, which the mocks draw at 12.
  'inline-flex items-center rounded-element border border-track-ring px-2 py-0.5 text-xs2 font-bold uppercase tracking-tight transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
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
        ink: 'bg-track-pink text-track-ring',
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
