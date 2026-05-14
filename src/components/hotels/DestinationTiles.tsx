import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { TopHotelCity } from '@/hooks/useHotelDiscovery';
import { getRandomFallbackImage } from '@/utils/fallbackImages';

interface DestinationTilesProps {
  cities: TopHotelCity[];
}

export function DestinationTiles({ cities }: DestinationTilesProps) {
  if (!cities.length) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {cities.map((c) => {
        const img = c.image_url || getRandomFallbackImage();
        const href = `/hotels?city=${encodeURIComponent(c.slug ?? c.name)}`;
        return (
          <LocalizedLink
            key={c.city_id}
            to={href}
            className="relative block group border border-foreground/10 overflow-hidden aspect-[4/3]"
            style={{ textDecoration: 'none', color: 'inherit' }}
            aria-label={`${c.name}, ${c.hotel_count} hotels`}
          >
            <img
              src={img}
              alt={c.name}
              className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
              <p className="font-semibold text-base leading-tight">{c.name}</p>
              <p className="text-xs opacity-90 mt-0.5">
                {c.hotel_count} {c.hotel_count === 1 ? 'hotel' : 'hotels'}
                {c.country ? ` · ${c.country}` : ''}
              </p>
            </div>
          </LocalizedLink>
        );
      })}
    </div>
  );
}
