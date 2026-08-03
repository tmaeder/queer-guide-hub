import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  // PASTE-UP: a badge is a stamped chip, so the base carries no border at all
  // and every variant is a flat fill.
  'inline-flex items-center rounded-badge px-2.5 py-0.5 text-xs2 font-semibold tracking-tight transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-foreground text-background',
        // Over-image chip. 131 call sites across 76 files — the single
        // highest-leverage line in the border sweep. Was the one bordered
        // variant; now a translucent plate, still legible on a photograph.
        outline: 'bg-background/80 backdrop-blur-sm text-foreground hover:bg-background',
        soft: 'bg-surface-container-high text-foreground',
        // Brand ink chip. NON-SEMANTIC — never use it to mean a status, and
        // never on a safety surface. See the doctrine in src/index.css.
        ink: 'bg-ink-pink text-ink-pink-foreground',
        // Legacy alias.
        secondary: 'bg-surface-container-high text-foreground',
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
