import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { springs } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { getRandomFallbackImage } from '@/utils/fallbackImages';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, hoverable, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'bg-card text-card-foreground rounded-xl border border-border/60 transition-all duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        hoverable && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[var(--shadow-aceternity)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
Card.displayName = 'Card';

/* ── MotionCard — opt-in hover-lift card powered by motion ────────── */

const MotionCard = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => {
    const reduced = useReducedMotion();
    const hover = reduced
      ? {}
      : {
          whileHover: { y: -3 },
          transition: springs.snappy,
        };
    return (
      <motion.div
        ref={ref}
        className={cn(
          'bg-card text-card-foreground rounded-xl border border-border/60 transition-shadow hover:shadow-[var(--shadow-aceternity)]',
          className,
        )}
        {...hover}
        {...(props as Record<string, unknown>)}
      >
        {children}
      </motion.div>
    );
  },
);
MotionCard.displayName = 'MotionCard';

/* ── CardImage ──────────────────────────────────────────────────────── */

interface CardImageProps {
  src?: string | null;
  alt: string;
  height?: number;
  fallbackIcon?: LucideIcon;
  children?: React.ReactNode;
}

/**
 * Strip the Referer header for cross-origin hotlinks. Some publisher CDNs
 * (Guardian, etc.) return 401 when Referer is set to a non-allowed origin.
 * Internal hosts get the default policy so analytics still works.
 */
const TRUSTED_HOSTS = new Set([
  'queer.guide',
  'www.queer.guide',
  'img.queer.guide',
]);

function isTrustedSrc(src: string): boolean {
  try {
    const host = new URL(src, 'https://queer.guide').hostname;
    return (
      TRUSTED_HOSTS.has(host) ||
      host.endsWith('.supabase.co') ||
      host.endsWith('.supabase.in')
    );
  } catch {
    return true;
  }
}

const CardImage = ({
  src,
  alt,
  height = 200,
  fallbackIcon: _FallbackIcon,
  children,
}: CardImageProps) => {
  const [error, setError] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const fallbackSrc = React.useMemo(() => getRandomFallbackImage(), []);

  const effectiveSrc = (!src || error) ? fallbackSrc : src;
  const referrerPolicy = isTrustedSrc(effectiveSrc) ? undefined : 'no-referrer';

  return (
    <div className="relative overflow-hidden rounded-t-xl" style={{ height }}>
      <img
        src={effectiveSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy={referrerPolicy}
        onLoad={() => setLoaded(true)}
        onError={() => {
          // Avoid the fallback-loops-to-itself case: only flip once.
          if (!error) setError(true);
        }}
        className={`img-lazy-fade${loaded ? ' loaded' : ''} w-full h-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]`}
      />
      {children}
    </div>
  );
};
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
  MotionCard,
  CardImage,
  CardHeaderCompat as CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
