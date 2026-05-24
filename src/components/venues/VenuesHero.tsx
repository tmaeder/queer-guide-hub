import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin } from 'lucide-react';
import { useFeaturedVenue } from '@/hooks/useVenuesV2Data';

export function VenuesHero() {
  const { t } = useTranslation();
  const { venue, loading } = useFeaturedVenue();

  if (loading) {
    return <Skeleton className="h-[280px] w-full rounded-container" />;
  }
  if (!venue) return null;

  const cover = venue.images?.[0] ?? venue.logo_url ?? '';
  const blurb = (venue.description ?? '').split(/(?<=[.!?])\s+/)[0];

  return (
    <section
      className="relative overflow-hidden rounded-container border bg-card"
      aria-label={t('venues.hero.label', 'Featured venue')}
    >
      <div className="grid md:grid-cols-2">
        {cover && (
          <div
            className="relative h-56 md:h-full min-h-[240px] bg-muted bg-cover bg-center"
            style={{ backgroundImage: `url(${cover})` }}
            aria-hidden
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-black/15" />
          </div>
        )}
        <div className="flex flex-col justify-between gap-6 p-6 md:p-10">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
              {t('venues.hero.kicker', 'Featured this week')}
            </p>
            <h1 className="text-display font-semibold leading-tight tracking-tight">
              {venue.name}
            </h1>
            {(venue.city || venue.country) && (
              <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin size={14} />
                {[venue.city, venue.country].filter(Boolean).join(', ')}
              </p>
            )}
            {blurb && (
              <p className="mt-4 text-body-lg text-muted-foreground line-clamp-3">{blurb}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <LocalizedLink to={`/venues/${venue.slug ?? venue.id}`}>
                {t('venues.hero.cta', 'Read more')}
              </LocalizedLink>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
