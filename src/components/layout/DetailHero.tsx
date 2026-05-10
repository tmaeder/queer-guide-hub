import { Parallax } from '@/components/motion';
import { getRandomFallbackImage } from '@/utils/fallbackImages';

interface DetailHeroProps {
  imageUrl?: string | null;
  alt: string;
  /** Height in px or a Tailwind class. Default 192px on mobile, 240px on md+. */
  heightClassName?: string;
}

export function DetailHero({ imageUrl, alt, heightClassName = 'h-48 md:h-60' }: DetailHeroProps) {
  return (
    <div className={`w-full ${heightClassName} rounded-2xl overflow-hidden mb-4 relative`}>
      <Parallax speed={0.25}>
        <img
          src={imageUrl || getRandomFallbackImage()}
          alt={alt}
          className="w-full h-full object-cover scale-110"
        />
      </Parallax>
    </div>
  );
}
