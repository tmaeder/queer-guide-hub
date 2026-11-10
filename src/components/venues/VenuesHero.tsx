import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ArrowRight } from '@/components/icons';
import { Image } from '@/components/ui/Image';
import { useFeaturedVenue } from '@/hooks/useVenuesV2Data';
import { useVenueCategoryLabel } from '@/lib/venueCategories';
import { venueClosureLabel } from '@/lib/venueClosureLabel';
import { getVenueVisual } from '@/lib/venueVisual';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import { localizedField, type I18nMap } from '@/lib/localizeContent';
import type { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];

export function VenuesHero({ fallback }: { fallback?: Venue }) {
  const { t, i18n } = useTranslation();
  const { venue: featured } = useFeaturedVenue();
  const featuredVenue =
    featured && !featured.safety_gated && !venueClosureLabel(featured) ? featured : null;
  const venue = featuredVenue ?? fallback;
  const category = useVenueCategoryLabel(venue?.category);
  if (!venue) return null;

  const photo = venue.images?.find(isValidImageUrl);
  const visual = photo ? { src: photo, fit: 'cover' as const, plate: null } : getVenueVisual(venue);
  const name = localizedField(venue.name, venue.name_i18n as I18nMap, i18n.language);
  const description = localizedField(
    venue.description,
    venue.description_i18n as I18nMap,
    i18n.language,
  ).split(/(?<=[.!?])\s+/)[0];
  const place = [category, venue.city || venue.country].filter(Boolean).join(' · ');

  return (
    <section
      aria-label={featuredVenue ? t('venues.hero.label', 'Featured venue') : t('venues.title', 'Venues')}
      className="min-w-0 overflow-hidden rounded-panel bg-card"
    >
      <LocalizedLink
        to={`/venues/${venue.slug || venue.id}`}
        className="group flex min-w-0 items-stretch no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        {visual.src && (
          <div className="w-1/4 max-w-36 shrink-0 self-center">
            <Image
              src={visual.src}
              alt=""
              aspect="square"
              fit={visual.fit}
              plate={visual.plate ?? undefined}
              rounded="none"
              priority
              sizes="(min-width: 1024px) 144px, 23vw"
            />
          </div>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 px-4 py-4 md:gap-4 md:px-6">
          <div className="min-w-0 flex-1">
            {place && <p className="break-words text-13 text-muted-foreground">{place}</p>}
            <h2 className="mt-1 break-words font-display text-title leading-tight group-hover:underline sm:text-headline rtl:font-sans rtl:font-bold">
              {name}
            </h2>
            {description && (
              <p className="mt-2 line-clamp-2 text-15 text-muted-foreground">{description}</p>
            )}
          </div>
          <ArrowRight size={20} aria-hidden className="shrink-0 rtl:rotate-180" />
        </div>
      </LocalizedLink>
    </section>
  );
}
