import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MapPin, ArrowRight } from 'lucide-react';
import type { Hotel } from '@/hooks/useHotels';
import { getRandomFallbackImage } from '@/utils/fallbackImages';
import { safeText } from '@/utils/safeDisplay';

interface HotelHeroProps {
  hotel: Hotel;
}

function excerpt(text: string | null | undefined, max = 180): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + '…';
}

export function HotelHero({ hotel }: HotelHeroProps) {
  const image = hotel.images?.[0] || getRandomFallbackImage();
  const name = safeText(hotel.name);
  const city = safeText(hotel.city);
  const country = safeText(hotel.country);
  const location = [city, country].filter(Boolean).join(', ');
  const note = excerpt(hotel.queer_safety_notes);

  return (
    <LocalizedLink
      to={`/hotels/${hotel.slug}`}
      className="block group border border-foreground/10"
      style={{ textDecoration: 'none', color: 'inherit' }}
      aria-label={name}
    >
      <div className="grid grid-cols-1 md:grid-cols-2">
        <div className="relative bg-muted aspect-[4/3] md:aspect-auto md:min-h-[360px] overflow-hidden">
          <img
            src={image}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
        <div className="p-6 md:p-10 flex flex-col gap-4 justify-center bg-card">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Featured stay
          </span>
          <h2 className="text-3xl md:text-4xl font-semibold leading-tight">
            {name}
          </h2>
          {location && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span className="text-sm">{location}</span>
            </div>
          )}
          {note && (
            <p className="text-sm md:text-base text-foreground/80 leading-relaxed">
              {note}
            </p>
          )}
          <div className="inline-flex items-center gap-2 text-sm font-medium mt-2 group-hover:underline">
            View hotel
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </LocalizedLink>
  );
}
