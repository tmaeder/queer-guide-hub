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
 *
 * Carries `group` because these cards put their click target in an
 * absolutely-positioned overlay link that is a SIBLING of the card (see the
 * card-overlay convention in CLAUDE.md). That overlay covers the card, so the
 * pointer never enters the card's own hover chain and `hover:` on the card is
 * dead — only an ancestor of the overlay still sees the hover. This wrapper is
 * that ancestor, so card hover states must be written as `group-hover:`
 * (`<Card hoverable="group">`).
 */
export function CardHoverEffect({ children, className }: CardHoverEffectProps) {
  return <div className={cn('group relative', className)}>{children}</div>;
}
