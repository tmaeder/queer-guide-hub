import { memo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { MapPin, Star, DollarSign } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Image } from '@/components/ui/Image';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import type { Hotel } from '@/hooks/useHotels';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { safeText } from '@/utils/safeDisplay';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import { hotelGlyph } from '@/lib/cardGlyphs';
import { StationBadge } from '@/components/ui/StationBadge';

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
          size={12}
          style={{ color: i < range ? 'currentColor' : 'hsl(var(--muted-foreground))' }}
        />
      ))}
    </div>
  );
}

const HotelCardFixture = () => (
  <div className="overflow-hidden rounded-container h-full flex flex-col bg-card">
    <div className="bg-accent flex items-center justify-center" style={{ height: 180 }}>
      <MapPin size={32} className="text-muted-foreground" />
    </div>
    <div className="p-4 flex-1 flex flex-col gap-1">
      <p className="font-semibold truncate">Sample Hotel</p>
      <div className="flex items-center gap-1 text-muted-foreground">
        <MapPin size={14} />
        <p className="text-sm truncate">Berlin, Germany</p>
      </div>
      <div className="flex items-center gap-2 mt-auto pt-2">
        <Star size={14} />
        <p className="text-sm font-semibold">4.5</p>
        <Badge className="text-2xs" variant="outline" style={{ padding: '1px 5px' }}>
          LGBTQ+
        </Badge>
      </div>
    </div>
  </div>
);

function HotelCardImpl({ hotel, loading = false }: HotelCardProps) {
  const { t } = useTranslation();
  if (loading || !hotel) {
    return (
      <Skeleton
        name="hotel-card"
        loading={true}
        fixture={<HotelCardFixture />}
        fallback={<PageLoadingState count={1} />}
      >
        <div />
      </Skeleton>
    );
  }

  const rawImage = hotel.images && hotel.images.length > 0 ? hotel.images[0] : null;
  const imageUrl = isValidImageUrl(rawImage) ? rawImage : null;
  const glyph = hotelGlyph(hotel.hotel_type);
  const hotelName = safeText(hotel.name);
  const city = safeText(hotel.city);
  const country = safeText(hotel.country);
  const location = [city, country].filter(Boolean).join(', ');
  const typeLabel = hotel.hotel_type
    ? safeText(TYPE_LABELS[hotel.hotel_type] || hotel.hotel_type)
    : '';
  const hasNumericRating =
    typeof hotel.star_rating === 'number' &&
    Number.isFinite(hotel.star_rating) &&
    hotel.star_rating > 0;

  return (
    <Skeleton name="hotel-card" loading={false} fixture={<HotelCardFixture />}>
      <LocalizedLink to={`/hotels/${hotel.slug}`} className="no-underline">
        <CardHoverEffect>
          <div className="group group/card overflow-hidden rounded-container bg-card transition-colors duration-normal h-full flex flex-col">
            {/* Image */}
            <Image
              src={imageUrl}
              alt={hotelName}
              aspect="card"
              imageRole="cover"
              rounded="none"
              fallbackEntityType="hotel"
              fallbackKey={hotel.slug ?? hotel.id}
              fallbackGlyph={glyph}
            >
              {/*
            Featured badge is now driven by the curated `featured_priority`
            column added in 20260504114754_hotels_featured_priority.sql.
            Until types.ts is regenerated we cast here; once regenerated
            the cast can be removed.
          */}
              {(() => {
                const fp = (hotel as { featured_priority?: number | null }).featured_priority;
                return typeof fp === 'number' ? (
                  <span
                    className={cn(badgeVariants({ variant: 'overlay' }), 'absolute top-2 right-2')}
                  >
                    {t('common.featured', 'Featured')}
                  </span>
                ) : null;
              })()}
            </Image>

            {/* Content */}
            <div
              className={cn(
                'flex flex-1 flex-col gap-1',
                imageUrl ? 'px-4 pb-4 group-has-[[data-fallback=station]]/card:pt-4' : 'p-4',
              )}
            >
              {/* Photo cards carry the type's mark on the seam; an image-less
                  card already shows it in the plate's station disc. */}
              {imageUrl && <StationBadge glyph={glyph} className="-mt-8 mb-1" />}
              {typeLabel && (
                <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground truncate">
                  {typeLabel}
                </p>
              )}
              {hotelName && (
                <h3 className="text-title font-bold leading-tight truncate" title={hotelName}>
                  {hotelName}
                </h3>
              )}

              {location && (
                <p className="text-xs text-muted-foreground truncate" title={location}>
                  {location}
                </p>
              )}

              <div className="flex items-center gap-2 mt-auto pt-2">
                {hasNumericRating && (
                  <div className="flex items-center" style={{ gap: 1 }}>
                    <Star size={14} style={{ fill: 'currentColor' }} />
                    <p className="text-sm font-semibold">{hotel.star_rating}</p>
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
                        className="text-2xs"
                        key={tag}
                        variant="outline"
                        style={{ padding: '1px 5px' }}
                      >
                        {tag}
                      </Badge>
                    ));
                  }
                  return hotel.lgbtq_friendly ? (
                    <Badge className="text-2xs" variant="outline" style={{ padding: '1px 5px' }}>
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

// Memoized: rendered in hotel grids/lists — skip re-render when props are
// referentially stable.
export const HotelCard = memo(HotelCardImpl);
