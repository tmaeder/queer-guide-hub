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
import { CityNetwork } from './CityNetwork';

const CITY_SLUG = 'zuerich';
const CITY_HREF = `/city/${CITY_SLUG}`;
const CITY_TIMEZONE = 'Europe/Zurich';

export function HomeCityFeature() {
  const { t, i18n } = useTranslation();
  const { city } = useOptimizedCity(CITY_SLUG);
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
        timeZone: CITY_TIMEZONE,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(new Date(event.start_date))
    : null;
  const eventTitle = event
    ? localizedField(event.title, event.title_i18n as I18nMap, i18n.language)
    : t('home.cityFeature.browseEvents', 'Browse Zürich events');

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
            <CityNetwork slug={CITY_SLUG} variant="thumb" className="h-full" />
          </div>
        )}
        <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-x-2 gap-y-1 sm:inset-x-4 sm:bottom-4">
          <h2 id="home-city-feature-title" className="text-headline leading-none">
            <LocalizedLink
              to={CITY_HREF}
              aria-label={t('home.cityFeature.exploreCity', 'Zürich city guide')}
              className="inline-flex min-h-11 items-center gap-2 rounded-element bg-card px-4 py-2 font-display text-foreground underline-offset-4 hover:underline rtl:font-sans rtl:font-bold"
            >
              Zürich
              <TransitIcon name="arrow-right" size={20} className="rtl:rotate-180" />
            </LocalizedLink>
          </h2>
          {photo.url && (metadata?.attribution || metadata?.photographer || metadata?.license) && (
            <ImageCredit
              attribution={metadata.attribution || metadata.photographer}
              license={metadata.license}
              className="rounded-badge bg-card px-2 py-1"
            />
          )}
        </div>
      </div>

      <ul className="mt-1 grid divide-y divide-border-hairline sm:grid-cols-2 sm:divide-y-0">
        <li className="min-w-0 sm:pe-4">
          <LocalizedLink
            to={event ? `/events/${event.slug || event.id}` : '/events?city=Zurich'}
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
            to="/venues/regenbogenhaus"
            className="flex min-h-14 items-center gap-2 rounded-element px-2 py-2 no-underline underline-offset-4 hover:underline"
          >
            <TransitIcon name="map" size={20} className="shrink-0" />
            <span className="min-w-0">
              <span className="block text-13 text-muted-foreground">
                {t('home.cityFeature.communitySpace', 'Community space')}
              </span>
              <span className="block text-15 font-bold">Regenbogenhaus</span>
            </span>
          </LocalizedLink>
        </li>
      </ul>
    </section>
  );
}
