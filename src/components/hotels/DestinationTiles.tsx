import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { TopHotelCity } from '@/hooks/useHotelDiscovery';
import { getFallbackImage } from '@/utils/fallbackImages';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import { CityNetwork } from '@/components/home/subway/CityNetwork';
import { hasCityNetwork } from '@/components/home/subway/cityNetworkGeometry';

interface DestinationTilesProps {
  cities: TopHotelCity[];
}

export function DestinationTiles({ cities }: DestinationTilesProps) {
  if (!cities.length) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {cities.map((c) => {
        const fallback = getFallbackImage('place', c.city_id);
        const hasOwnImage = isValidImageUrl(c.image_url);
        // `isValidImageUrl` is a type guard, so this ternary (not the boolean)
        // is what narrows `string | null` to `string`.
        const img = isValidImageUrl(c.image_url) ? c.image_url : fallback;
        // No real photo but a real network: draw the city rather than serve a
        // stock skyline that belongs to nowhere in particular.
        const showNetwork = !hasOwnImage && hasCityNetwork(c.slug);
        const href = `/hotels?city=${encodeURIComponent(c.slug ?? c.name)}`;
        return (
          <LocalizedLink
            key={c.city_id}
            to={href}
            className="relative block group overflow-hidden aspect-[4/3] no-underline"
            style={{ color: 'inherit' }}
            aria-label={`${c.name}, ${c.hotel_count} hotels`}
          >
            {showNetwork ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background p-4 pb-12">
                <CityNetwork slug={c.slug} variant="thumb" className="h-full" />
              </div>
            ) : (
              <>
                {}
                <img
                  src={img}
                  alt={c.name}
                  className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
              </>
            )}
            <div
              className={
                showNetwork
                  ? 'absolute bottom-0 left-0 right-0 p-4 text-foreground'
                  : 'absolute bottom-0 left-0 right-0 p-4 text-white'
              }
            >
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
