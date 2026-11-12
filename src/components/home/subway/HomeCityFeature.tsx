import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { Image } from '@/components/ui/Image';
import { ImageCredit } from '@/components/ui/ImageCredit';
import { DISCOVERY_EVENT_WINDOW_MS, selectDiscoveryEvent } from '@/lib/discoveryEvent';
import { useEventsQuery } from '@/hooks/useEvents';
import { useOptimizedCity } from '@/hooks/usePlaces';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { localizedField, type I18nMap } from '@/lib/localizeContent';
import { useHomeRegionContext } from '@/components/home/homeRegionContext';
import { CityNetwork } from './CityNetwork';

/** Featured when the visitor's region has no city (no geo, no profile). */
const FALLBACK_SLUG = 'zuerich';

export function HomeCityFeature() {
  const { t, i18n } = useTranslation();
  // Same region as the bands below, so the hero never names a different city.
  // Empty slug while the region resolves keeps the fallback from flashing.
  const region = useHomeRegionContext();
  const slug = region.loading ? '' : region.citySlug || FALLBACK_SLUG;
  const { city } = useOptimizedCity(slug);
  const cityName = city?.name ?? '';
  // The region resolves AFTER first paint, so for ~300-800ms `slug` is '' and there is
  // no city. Rendering the city half anyway published a dangling `/events?city=` and
  // `/venues?city=` (empty filter), a 'Browse  events' label with the name missing, a
  // city-guide link with no accessible name, and a SECOND 'Browse places' inside the
  // hero -- which is also what made four home-magazine e2e cases fail. Hold the
  // city-dependent half until there is a city to name.
  const cityReady = Boolean(city && cityName);
  const isFallback = slug === FALLBACK_SLUG;
  const photo = resolveEntityImage('city', city);
  const metadata = photo.metadata as
    { attribution?: string; photographer?: string; license?: string } | null | undefined;
  const [now] = useState(Date.now);
  // A day-stable window keeps the query cached and distant featured events out.
  const start = new Date(now).setUTCHours(0, 0, 0, 0);
  const end = start + DISCOVERY_EVENT_WINDOW_MS;
  const { events } = useEventsQuery(
    city?.id
      ? {
          cityId: city.id,
          limit: 12,
          dateRange: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
        }
      : null,
  );
  const event = selectDiscoveryEvent(
    events.filter((item) => item.city_id === city?.id),
    now,
  );
  const date = event
    ? new Intl.DateTimeFormat(i18n.language, {
        timeZone: city?.timezone ?? undefined,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(new Date(event.start_date))
    : null;
  const eventTitle = event
    ? localizedField(event.title, event.title_i18n as I18nMap, i18n.language)
    : t('home.cityFeature.browseEvents', 'Browse {{city}} events', { city: cityName });

  return (
    <section aria-labelledby="home-city-feature-title" className="min-w-0">
      <div className="relative overflow-hidden rounded-panel bg-surface-container">
        {photo.url ? (
          <Image
            src={photo.url}
            alt=""
            aspect="card"
            rounded="none"
            priority
            sizes="(min-width: 1600px) 800px, (min-width: 1024px) 51vw, 92vw"
          />
        ) : (
          <div aria-hidden="true" className="aspect-[16/10] px-6 pb-16 pt-4 sm:px-10">
            <CityNetwork slug={slug} variant="thumb" className="h-full" />
          </div>
        )}
        {cityReady && (
          <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-x-2 gap-y-1 sm:inset-x-4 sm:bottom-4">
            <h2 id="home-city-feature-title" className="text-headline leading-none">
              <LocalizedLink
                to={`/city/${city?.slug ?? slug}`}
                aria-label={t('home.cityFeature.exploreCity', '{{city}} city guide', {
                  city: cityName,
                })}
                className="inline-flex min-h-11 items-center gap-2 rounded-element bg-card px-4 py-2 font-display text-foreground underline-offset-4 hover:underline rtl:font-sans rtl:font-bold"
              >
                {cityName}
                <TransitIcon name="arrow-right" size={20} className="rtl:rotate-180" />
              </LocalizedLink>
            </h2>
            {photo.url &&
              (metadata?.attribution || metadata?.photographer || metadata?.license) && (
                <ImageCredit
                  attribution={metadata.attribution || metadata.photographer}
                  license={metadata.license}
                  className="rounded-badge bg-card px-2 py-1"
                />
              )}
          </div>
        )}
      </div>

      {cityReady && (
        <ul className="mt-1 grid divide-y divide-border-hairline sm:grid-cols-2 sm:divide-y-0">
          <li className="min-w-0 sm:pe-4">
            <LocalizedLink
              to={
                event
                  ? `/events/${event.slug || event.id}`
                  : `/events?city=${encodeURIComponent(cityName)}`
              }
              className="flex min-h-14 items-center gap-2 rounded-element px-2 py-2 no-underline underline-offset-4 hover:underline"
            >
              <TransitIcon name="events" size={20} className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-13 text-muted-foreground">
                  {date && event ? (
                    <time dateTime={event.start_date}>{date}</time>
                  ) : (
                    t('home.cityFeature.whatsOn', 'What’s on')
                  )}
                </span>
                <span className="line-clamp-2 text-15 font-bold">{eventTitle}</span>
              </span>
            </LocalizedLink>
          </li>
          <li className="min-w-0 sm:border-s sm:border-border-hairline sm:ps-4">
            <LocalizedLink
              to={
                isFallback
                  ? '/venues/regenbogenhaus'
                  : `/venues?city=${encodeURIComponent(cityName)}`
              }
              className="flex min-h-14 items-center gap-2 rounded-element px-2 py-2 no-underline underline-offset-4 hover:underline"
            >
              <TransitIcon name="map" size={20} className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-13 text-muted-foreground">
                  {isFallback ? t('home.cityFeature.communitySpace', 'Community space') : cityName}
                </span>
                <span className="block text-15 font-bold">
                  {isFallback ? 'Regenbogenhaus' : t('home.discovery.places', 'Browse places')}
                </span>
              </span>
            </LocalizedLink>
          </li>
        </ul>
      )}
    </section>
  );
}
