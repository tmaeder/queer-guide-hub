import { Parallax } from '@/components/motion';
import { Lens } from '@/components/effects/Lens';
import { Beams } from '@/components/effects/Beams';
import { getRandomFallbackImage } from '@/utils/fallbackImages';

interface DetailHeroProps {
  imageUrl?: string | null;
  alt: string;
  /** Height in px or a Tailwind class. Default 192px on mobile, 240px on md+. */
  heightClassName?: string;
}

export function DetailHero({ imageUrl, alt, heightClassName = 'h-64 md:h-80' }: DetailHeroProps) {
  return (
    <Lens zoom={1.6} size={220} className={`group w-full ${heightClassName} rounded-2xl mb-6 ring-1 ring-border/60 shadow-[var(--shadow-aceternity)]`}>
      <Parallax speed={0.25}>
        <img
          src={imageUrl || getRandomFallbackImage()}
          alt={alt}
          className="w-full h-full object-cover scale-110 transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.15]"
        />
      </Parallax>
      {/* Soft beams ornament above the image — invisible on default, layered scrim only. */}
      <Beams count={4} className="opacity-40" />
      {/* Bottom scrim for any text that may overlay. */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 scrim-bottom pointer-events-none" aria-hidden="true" />
    </Lens>
  );
}
