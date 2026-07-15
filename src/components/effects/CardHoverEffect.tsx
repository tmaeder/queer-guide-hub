import { cn } from '@/lib/utils';

interface CardHoverEffectProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Interactive-card wrapper. A pure positioning passthrough — every consumer
 * card already owns its border + hover treatment (the primitive `Card`, or an
 * explicit `border … hover:border-foreground/40`). The wrapper used to add its
 * OWN square `border` on top, which double-bordered rounded cards and left the
 * wrapper's square corners poking past their rounded corners. Kept as a named
 * wrapper so the intent ("interactive card") stays visible at consumer sites.
 * The decorative 3D variant was removed 2026-05-19 (refactor/monochrome-2026).
 */
export function CardHoverEffect({ children, className }: CardHoverEffectProps) {
  return <div className={cn('relative', className)}>{children}</div>;
}
