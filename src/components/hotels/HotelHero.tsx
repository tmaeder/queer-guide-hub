import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MapPin, ArrowRight } from '@/components/icons';
import type { Hotel } from '@/hooks/useHotels';
import { Image } from '@/components/ui/Image';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import { safeText } from '@/utils/safeDisplay';
import { hotelGlyph } from '@/lib/cardGlyphs';

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
  const image = hotel.images?.find(isValidImageUrl);
  const name = safeText(hotel.name);
  const city = safeText(hotel.city);
  const country = safeText(hotel.country);
  const location = [city, country].filter(Boolean).join(', ');
  const note = excerpt(hotel.queer_safety_notes);

  return (
    <LocalizedLink
      to={`/hotels/${hotel.slug}`}
      className="group grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] items-center gap-4 rounded-container bg-muted/55 p-4 text-foreground no-underline sm:grid-cols-[8rem_minmax(0,1fr)]"
      aria-label={name}
    >
      <Image
        src={image}
        alt=""
        aspect="square"
        imageRole="thumb"
        rounded="element"
        fallbackEntityType="hotel"
        fallbackKey={hotel.id}
        fallbackGlyph={hotelGlyph(hotel.hotel_type)}
        referrerPolicy="no-referrer"
      />
      <div className="min-w-0">
        {location && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin size={14} className="shrink-0" aria-hidden="true" />
            {location}
          </p>
        )}
        <h2 className="mt-1 break-words font-sans text-title font-bold group-hover:underline">{name}</h2>
        {note && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{note}</p>}
        <span className="mt-2 inline-flex items-center gap-2 text-sm font-semibold">
          View stay <ArrowRight size={16} aria-hidden="true" />
        </span>
      </div>
    </LocalizedLink>
  );
}
