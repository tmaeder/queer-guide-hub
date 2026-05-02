import { Parallax } from '@/components/motion';

interface DetailHeroProps {
  imageUrl?: string | null;
  alt: string;
  /** Height in px or a Tailwind class. Default 192px on mobile, 240px on md+. */
  heightClassName?: string;
}

export function DetailHero({ imageUrl, alt, heightClassName = 'h-48 md:h-60' }: DetailHeroProps) {
  if (!imageUrl) return null;
  return (
    <div className={`w-full ${heightClassName} rounded-2xl overflow-hidden mb-4 relative`}>
      <Parallax speed={0.25}>
        <img
          src={imageUrl}
          alt={alt}
          className="w-full h-full object-cover scale-110"
        />
      </Parallax>
    </div>
  );
}
