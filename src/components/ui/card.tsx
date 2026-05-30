import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Image } from './Image';

// MotionCard lives in a sibling file so importing Card doesn't drag
// framer-motion into the consumer's bundle. Re-exported below for the
// few call sites that opt into the hover-lift variant.
export { MotionCard } from './MotionCard';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, hoverable, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'bg-card text-card-foreground rounded-container border border-border/60 transition-all duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        hoverable && 'cursor-pointer hover:bg-muted/40',
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
    <div
      ref={ref}
      className={cn('flex flex-col gap-1.5 p-6', className)}
      {...props}
    >
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
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  >
    {children}
  </p>
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('px-6 pb-6 pt-0', className)}
      {...props}
    >
      {children}
    </div>
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center px-6 pt-0', className)}
      {...props}
    >
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
