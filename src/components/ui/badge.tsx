import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Chip rank (12px radius, 11px uppercase type) — the original Badge.
const CHIP =
  'rounded-element px-2 py-0.5 text-xs2 font-bold uppercase tracking-tight transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';
const MARK = 'gap-1 rounded-badge px-1.5 py-0.5 text-2xs';
const COUNT = 'justify-center rounded-badge h-5 min-w-7 px-1.5 text-2xs font-semibold';

const badgeVariants = cva(
  // Subway-map: a badge is a stamped tonal chip. The fill, label and 12px
  // silhouette carry the state; there is no perimeter rule.
  //
  // `rounded-element` (12px) rather than `rounded-badge` (9px): the design
  // system's badge rank is for count marks and swatches; this component is
  // the chip, which the mocks draw at 12.
  'inline-flex items-center',
  {
    variants: {
      variant: {
        default: `${CHIP} bg-foreground text-background`,
        // Over-image chip. 131 call sites across 76 files — the single
        // highest-leverage line here. Stays a translucent plate so it is
        // legible on a photograph without adding a cage.
        outline: `${CHIP} bg-background/85 backdrop-blur-sm text-foreground hover:bg-background`,
        soft: `${CHIP} bg-background text-foreground`,
        // Pink track chip. INK type: paper-on-pink measures 3.43:1 and a
        // badge is 11px, nowhere near the large-text threshold.
        ink: `${CHIP} bg-track-pink text-track-ring`,
        // Legacy alias.
        secondary: `${CHIP} bg-surface-container text-foreground`,
        destructive: `${CHIP} bg-destructive text-destructive-foreground`,

        // ── Badge rank (9px, 10px type): status marks inside dense rows ──
        mark: `${MARK} bg-muted text-muted-foreground`,
        'mark-solid': `${MARK} bg-foreground text-background`,
        // Unconfirmed / not-yet state: an outline is the whole signal.
        'mark-dashed': `${MARK} border border-dashed border-border text-muted-foreground`,
        // Numeric count in a nav row (admin sidebar). `count-alert` = overdue.
        count: `${COUNT} bg-muted text-muted-foreground`,
        'count-alert': `${COUNT} bg-destructive/10 text-foreground`,
        // "Featured" over a card image. Position via className.
        overlay:
          'rounded-badge px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider bg-foreground/80 text-background',
        // Rounded label with an icon (user mode). Size via className.
        pill: 'gap-1 rounded-full bg-muted font-medium text-foreground',
        // Raised paper plate (milestone category over an image or a row).
        plate:
          'gap-1 bg-card px-1.5 py-0.5 text-2xs uppercase tracking-label text-foreground rounded-container shadow-soft',
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
