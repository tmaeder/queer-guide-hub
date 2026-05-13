import { Parallax } from '@/components/motion';
import { SpotlightEffect } from '@/components/effects/SpotlightEffect';
import { getRandomFallbackImage } from '@/utils/fallbackImages';

interface DetailHeroProps {
  imageUrl?: string | null;
  alt: string;
  /** Height in px or a Tailwind class. Default 256px on mobile, 384px on md+. */
  heightClassName?: string;
  title?: string;
  eyebrow?: string;
  children?: React.ReactNode;
}

export function DetailHero({
  imageUrl,
  alt,
  heightClassName = 'h-64 md:h-96',
  title,
  eyebrow,
  children,
}: DetailHeroProps) {
  return (
    <div
      className={`group/hero relative w-full ${heightClassName} mb-6 overflow-hidden rounded-3xl border border-border bg-muted shadow-md`}
    >
      <Parallax speed={0.25}>
        <img
          src={imageUrl || getRandomFallbackImage()}
          alt={alt}
          className="h-full w-full scale-110 object-cover"
        />
      </Parallax>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-scrim" />
      <SpotlightEffect className="absolute inset-0" />
      {(title || eyebrow || children) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-6 pb-7 sm:px-10 sm:pb-10 text-background">
          {eyebrow && (
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-background/30 bg-background/10 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-background/90 backdrop-blur-sm">
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-background" />
              {eyebrow}
            </div>
          )}
          {title && (
            <h1 className="max-w-3xl text-balance text-3xl font-bold leading-[1.05] tracking-tight text-background sm:text-5xl">
              {title}
            </h1>
          )}
          {children && <div className="pointer-events-auto mt-3 max-w-3xl text-background/90">{children}</div>}
        </div>
      )}
    </div>
  );
}
