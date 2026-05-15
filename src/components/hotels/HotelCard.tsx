import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MapPin, Star, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import type { Hotel } from '@/hooks/useHotels';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { safeText } from '@/utils/safeDisplay';
import { getRandomFallbackImage } from '@/utils/fallbackImages';

interface HotelCardProps {
  hotel?: Hotel;
  loading?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  hotel: 'Hotel',
  bnb: 'B&B',
  hostel: 'Hostel',
  guesthouse: 'Guesthouse',
  apartment: 'Apartment',
  resort: 'Resort',
  other: 'Other',
};

function PriceIndicator({ range }: { range: number | null }) {
  if (!range) return null;
  return (
    <div className="flex items-center" style={{ gap: 1 }}>
      {Array.from({ length: 4 }, (_, i) => (
        <DollarSign
          key={i}
          style={{ width: 12, height: 12, color: i < range ? 'currentColor' : 'hsl(var(--muted-foreground))' }}
        />
      ))}
    </div>
  );
}

const HotelCardFixture = () => (
  <div className="overflow-hidden rounded-container h-full flex flex-col bg-card border shadow-sm">
    <div className="bg-accent flex items-center justify-center" style={{ height: 180 }}>
      <MapPin style={{ width: 32, height: 32, color: 'hsl(var(--muted-foreground))' }} />
    </div>
    <div className="p-4 flex-1 flex flex-col gap-1">
      <p className="font-semibold truncate">Sample Hotel</p>
      <div className="flex items-center gap-1 text-muted-foreground">
        <MapPin style={{ width: 14, height: 14 }} />
        <p className="text-sm truncate">Berlin, Germany</p>
      </div>
      <div className="flex items-center gap-2 mt-auto pt-2">
        <Star style={{ width: 14, height: 14 }} />
        <p className="text-sm font-semibold">4.5</p>
        <Badge variant="outline" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>LGBTQ+</Badge>
      </div>
    </div>
  </div>
);

export function HotelCard({ hotel, loading = false }: HotelCardProps) {
  if (loading || !hotel) {
    return (
      <Skeleton name="hotel-card" loading={true} fixture={<HotelCardFixture />} fallback={<PageLoadingState count={1} />}>
        <div />
      </Skeleton>
    );
  }

  const imageUrl = hotel.images && hotel.images.length > 0 ? hotel.images[0] : null;
  const hotelName = safeText(hotel.name);
  const city = safeText(hotel.city);
  const country = safeText(hotel.country);
  const location = [city, country].filter(Boolean).join(', ');
  const typeLabel = hotel.hotel_type
    ? safeText(TYPE_LABELS[hotel.hotel_type] || hotel.hotel_type)
    : '';
  const hasNumericRating =
    typeof hotel.star_rating === 'number' && Number.isFinite(hotel.star_rating) && hotel.star_rating > 0;

  return (
    <Skeleton name="hotel-card" loading={false} fixture={<HotelCardFixture />}>
    <LocalizedLink to={`/hotels/${hotel.slug}`} style={{ textDecoration: 'none' }}>
      <CardHoverEffect>
      <div className="group overflow-hidden rounded-xl border border-border bg-card transition-colors duration-300 hover:border-foreground/40 h-full flex flex-col">
        {/* Image */}
        <div className="relative overflow-hidden bg-accent" style={{ height: 180 }}>
          <img
            src={imageUrl || getRandomFallbackImage()}
            alt={hotelName}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
            decoding="async"
            className="grayscale-[0.15] transition-all duration-500 ease-out group-hover:grayscale-0 group-hover:scale-[1.04]"
          />
          {/*
            Featured badge is now driven by the curated `featured_priority`
            column added in 20260504114754_hotels_featured_priority.sql.
            Until types.ts is regenerated we cast here; once regenerated
            the cast can be removed.
          */}
          {(() => {
            const fp = (hotel as { featured_priority?: number | null })
              .featured_priority;
            return typeof fp === 'number' ? (
              <Badge
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'white',
                }}
              >
                Featured
              </Badge>
            ) : null;
          })()}
          {typeLabel && (
            <Badge
              variant="outline"
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                backgroundColor: 'hsl(var(--background))',
              }}
            >
              {typeLabel}
            </Badge>
          )}
        </div>

        {/* Content */}
        <div className="p-4 flex-1 flex flex-col gap-1">
          {hotelName && (
            <p
              className="font-semibold truncate"
              style={{ lineHeight: 1.3 }}
              title={hotelName}
            >
              {hotelName}
            </p>
          )}

          {location && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <MapPin style={{ width: 14, height: 14, flexShrink: 0 }} />
              <p className="text-sm truncate" title={location}>
                {location}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 mt-auto pt-2">
            {hasNumericRating && (
              <div className="flex items-center" style={{ gap: 1 }}>
                <Star style={{ width: 14, height: 14, fill: 'currentColor' }} />
                <p className="text-sm font-semibold">
                  {hotel.star_rating}
                </p>
              </div>
            )}
            <PriceIndicator range={hotel.price_range} />
            {(() => {
              // Prefer up to 2 of the row's actual tags (e.g. clothing-optional,
              // power-host) over a generic 'LGBTQ+' pill that's set on 100% of
              // rows. Fall back to LGBTQ+ only if no tags exist.
              const tags = (hotel.tags ?? [])
                .filter((t): t is string => typeof t === 'string' && t.length > 0)
                .slice(0, 2);
              if (tags.length > 0) {
                return tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    style={{ fontSize: '0.65rem', padding: '1px 5px' }}
                  >
                    {tag}
                  </Badge>
                ));
              }
              return hotel.lgbtq_friendly ? (
                <Badge variant="outline" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                  LGBTQ+
                </Badge>
              ) : null;
            })()}
          </div>
        </div>
      </div>
      </CardHoverEffect>
    </LocalizedLink>
    </Skeleton>
  );
}
