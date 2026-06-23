import { Lens } from '@/components/effects/Lens';
import { getFallbackImage, type FallbackTheme } from '@/utils/fallbackImages';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';

interface DetailHeroProps {
  imageUrl?: string | null;
  alt: string;
  /** Height in px or a Tailwind class. Default 192px on mobile, 240px on md+. */
  heightClassName?: string;
  /** CSS object-position for the hero image. Default 'center'. Use 'top' for person photos. */
  objectPosition?: string;
  /** Entity theme + stable key so the fallback is deterministic per entity. */
  entityType?: FallbackTheme;
  entityKey?: string;
}

export function DetailHero({ imageUrl, alt, heightClassName = 'h-64 md:h-80', objectPosition = 'center', entityType = 'default', entityKey }: DetailHeroProps) {
  const fallback = getFallbackImage(entityType, entityKey);
  return (
    <Lens
      zoom={1.6}
      size={220}
      className={`group w-full ${heightClassName} rounded-container mb-6 ring-1 ring-border/60`}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError is a media-error handler, not a user-input listener. */}
      <img
        src={isValidImageUrl(imageUrl) ? imageUrl : fallback}
        alt={alt}
        style={{ objectPosition }}
        referrerPolicy="no-referrer"
        onError={(e) => { if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback; }}
        className="w-full h-full object-cover scale-110 transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.15]"
      />
      {/* Bottom scrim for any text that may overlay. */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 scrim-bottom pointer-events-none" aria-hidden="true" />
    </Lens>
  );
}
