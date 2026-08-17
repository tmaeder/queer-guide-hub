import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Image } from './Image';

// MotionCard lives in a sibling file so importing Card doesn't drag
// framer-motion into the consumer's bundle. Re-exported below for the
// few call sites that opt into the hover-lift variant.
export { MotionCard } from './MotionCard';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * `true` — the card reacts to hovering itself.
   * `'group'` — the card reacts to hovering an ancestor marked `group`. Use this
   * whenever the card's click target is an absolutely-positioned overlay link
   * rendered as a SIBLING of the card (the card-overlay convention): the overlay
   * covers the card, so the pointer never puts the card in its own hover chain
   * and plain `hover:` silently never fires. `CardHoverEffect` is the `group`.
   */
  hoverable?: boolean | 'group';
}

/**
 * Subway-map card, soft edition: paper fill on a frame-grey page, 18px
 * corners, one soft shadow, and NO border.
 *
 * The border is gone on purpose (soft re-skin 2026-08-17, Brand Guidelines
 * §02b "Surfaces without cages"). What replaces it is the pair below —
 * `bg-card` sitting one tonal rung above `--background`, plus `shadow-soft`.
 * Those two are a unit: remove either and the card stops reading as a surface
 * at all rather than merely reading flatter. That is also why the REST shadow
 * is baked in here while the hover shadow lives in `.card-lift` — a
 * non-interactive card still has to be a card.
 *
 * Interactive cards additionally take `.card-lift` (hover translate + deeper
 * elevation) via className — deliberately NOT baked in, lift is opt-in per
 * surface.
 */
const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, hoverable, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'bg-card text-card-foreground rounded-container shadow-soft transition-all duration-fast ease-[cubic-bezier(0.22,1,0.36,1)]',
        hoverable === 'group' && 'group-hover:bg-surface-container-low',
        hoverable === true && 'cursor-pointer hover:bg-surface-container-low',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
Card.displayName = 'Card';

/* ── CardImage ──────────────────────────────────────────────────────── */

interface CardImageProps {
  src?: string | null;
  alt: string;
  height?: number;
  fallbackIcon?: LucideIcon;
  children?: React.ReactNode;
  className?: string;
  /**
   * Eager-load (above-the-fold). Sets loading="eager" +
   * fetchpriority="high" so the browser can't skip the request when
   * the card lives inside a transformed parent (CardHoverEffect's
   * translateZ) that confuses native lazy loading.
   */
  priority?: boolean;
}

/**
 * Thin compatibility wrapper over the unified {@link Image} component. Existing
 * consumers keep their `src`/`height`/`fallbackIcon` API unchanged but now gain
 * responsive Cloudflare srcset and the deterministic on-brand fallback for free.
 * `fallbackIcon` remains accepted for API compatibility but, as before, a missing
 * image falls back to the curated photo pool rather than an icon tile.
 */
const CardImage = ({
  src,
  alt,
  height = 200,
  fallbackIcon: _FallbackIcon,
  children,
  className,
  priority = false,
}: CardImageProps) => (
  <Image
    src={src ?? undefined}
    alt={alt}
    heightPx={height}
    imageRole="cover"
    rounded="top"
    priority={priority}
    className={className}
  >
    {children}
  </Image>
);
CardImage.displayName = 'CardImage';

const CardHeaderCompat = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props}>
      {children}
    </div>
  ),
);
CardHeaderCompat.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    >
      {children}
    </h3>
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props}>
    {children}
  </p>
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('px-6 pb-6 pt-0', className)} {...props}>
      {children}
    </div>
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center px-6 pt-0', className)} {...props}>
      {children}
    </div>
  ),
);
CardFooter.displayName = 'CardFooter';

export {
  Card,
  CardImage,
  CardHeaderCompat as CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
