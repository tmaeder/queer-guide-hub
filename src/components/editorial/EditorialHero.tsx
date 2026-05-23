import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { EditorialImage } from '@/lib/editorialImages';

type Decoration = 'dots' | 'grid' | 'none';
type Height = 'sm' | 'md' | 'lg';
type Position = 'cover' | 'side';

interface EditorialHeroProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  image: EditorialImage;
  imagePosition?: Position;
  decoration?: Decoration;
  height?: Height;
  scrim?: boolean;
  children?: ReactNode;
  className?: string;
}

const HEIGHTS: Record<Position, Record<Height, string>> = {
  cover: {
    sm: 'min-h-[240px] md:min-h-[280px]',
    md: 'min-h-[320px] md:min-h-[400px]',
    lg: 'min-h-[420px] md:min-h-[560px]',
  },
  side: {
    sm: 'min-h-[260px] md:min-h-[280px]',
    md: 'min-h-[320px] md:min-h-[400px]',
    lg: 'min-h-[400px] md:min-h-[480px]',
  },
};

/**
 * EditorialHero — shared banner for the six footer-class public pages.
 *
 * - `cover`: full-bleed image under a black scrim with overlaid text.
 * - `side`: 50/50 split (image right, text left on md+).
 *
 * Scrim pattern mirrors `TripCoverBand` (the canonical allowed gradient).
 * Image gracefully falls back to `image.fallback` and finally `bg-muted`.
 */
export function EditorialHero({
  eyebrow,
  title,
  subtitle,
  image,
  imagePosition = 'cover',
  decoration = 'none',
  height = 'md',
  scrim = imagePosition === 'cover',
  children,
  className,
}: EditorialHeroProps) {
  const [src, setSrc] = useState(image.src);
  const [errored, setErrored] = useState(false);

  const handleError = () => {
    if (!errored && image.fallback) {
      setErrored(true);
      setSrc(image.fallback);
    }
  };

  const sizeClass = HEIGHTS[imagePosition][height];

  if (imagePosition === 'side') {
    return (
      <section
        className={cn(
          'relative rounded-container overflow-hidden bg-muted',
          sizeClass,
          className,
        )}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 h-full min-h-inherit items-stretch">
          <div className="relative z-[1] flex flex-col justify-center gap-4 p-8 md:p-12 order-2 md:order-1">
            {eyebrow && (
              <p className="text-xs2 font-semibold uppercase tracking-wider text-muted-foreground">
                {eyebrow}
              </p>
            )}
            <h1 className="font-bold leading-[1.1] text-display md:text-headline-lg">{title}</h1>
            {subtitle && (
              <p className="text-body-lg text-muted-foreground leading-[1.6] max-w-[520px]">
                {subtitle}
              </p>
            )}
            {children && <div className="mt-2">{children}</div>}
          </div>
          <div className="relative bg-muted min-h-[240px] md:min-h-[400px] order-1 md:order-2">
            <img
              src={src}
              alt={image.alt}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              onError={handleError}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {decoration === 'grid' && <GridDecor side />}
          </div>
        </div>
      </section>
    );
  }

  // cover layout
  return (
    <section
      className={cn(
        'relative rounded-container overflow-hidden bg-muted',
        sizeClass,
        className,
      )}
    >
      <img
        src={src}
        alt={image.alt}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        onError={handleError}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {scrim && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/15 to-black/65 dark:from-black/35 dark:to-black/[0.78]"
        />
      )}
      {decoration === 'grid' && <GridDecor />}
      <div className="relative z-[1] flex h-full flex-col justify-end gap-4 p-8 md:p-12 text-white">
        {eyebrow && (
          <p className="text-xs2 font-semibold uppercase tracking-wider text-white/80">
            {eyebrow}
          </p>
        )}
        <h1
          className="font-bold leading-[1.05] text-display md:text-hero max-w-[820px]"
          style={{ textShadow: '0 2px 16px rgba(0,0,0,0.35)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-body-lg md:text-title text-white/90 leading-[1.6] max-w-[640px]">
            {subtitle}
          </p>
        )}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </section>
  );
}

function GridDecor({ side = false }: { side?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'absolute inset-0 pointer-events-none opacity-[0.18] mix-blend-overlay',
        side ? 'bg-[length:24px_24px]' : 'bg-[length:32px_32px]',
      )}
      style={{
        backgroundImage:
          'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
      }}
    />
  );
}
