import * as React from 'react';
import { cn } from '@/lib/utils';

interface CardHoverEffectProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Shadow accent for the hard lift. `'accent'` casts the pink track shadow
   * (live/urgent cards); `'none'` opts out for cards that are containers
   * rather than click targets. The old drum names ('pink' | 'blue' | 'over')
   * are accepted and collapse to the ink shadow, so the ~40 existing call
   * sites keep compiling until the Public phase retunes them.
   */
  ink?: 'pink' | 'blue' | 'over' | 'accent' | 'none';
}

/**
 * Interactive-card wrapper — subway-map edition. Applies `.card-lift`: 3px
 * ink border at rest; hover/focus translates −3,−3 and casts the hard ink
 * shadow (6px 6px 0, no blur). Replaces the PASTE-UP `.plate-offset`
 * misregistration plate (removed 2026-08-09).
 *
 * Carries `group` because these cards put their click target in an
 * absolutely-positioned overlay link that is a SIBLING of the card (see the
 * card-overlay convention in CLAUDE.md). That overlay covers the card, so the
 * pointer never enters the card's own hover chain and `hover:` on the card is
 * dead — only an ancestor of the overlay still sees the hover. This wrapper is
 * that ancestor, so card hover states must be written as `group-hover:`
 * (`<Card hoverable="group">`).
 */
export function CardHoverEffect({ children, className, ink = 'pink' }: CardHoverEffectProps) {
  return (
    <div
      className={cn(
        'group relative',
        ink !== 'none' && 'card-lift',
        ink === 'accent' && 'card-lift-accent',
        className,
      )}
    >
      {children}
    </div>
  );
}
