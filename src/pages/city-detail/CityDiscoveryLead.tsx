import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { Image } from '@/components/ui/Image';
import { ImageCredit } from '@/components/ui/ImageCredit';
import type { Database } from '@/integrations/supabase/types';
import { selectDiscoveryEvent } from '@/lib/discoveryEvent';
import { localizedField, type I18nMap } from '@/lib/localizeContent';
import { destinationTimezone } from './cityDiscovery';
import { cn } from '@/lib/utils';

type Event = Database['public']['Tables']['events']['Row'];
type Venue = Database['public']['Tables']['venues']['Row'];

function CityStop({
  to,
  icon,
  label,
  children,
}: {
  to: string;
  icon: 'events' | 'map';
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <LocalizedLink
      to={to}
      className="group flex min-h-16 items-center gap-4 py-2 no-underline outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-container-high">
        <TransitIcon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-13 text-muted-foreground">{label}</span>
        <span className="block break-words text-base font-bold leading-snug group-hover:underline">
          {children}
        </span>
      </span>
      <TransitIcon name="arrow-right" size={16} className="shrink-0 rtl:rotate-180" />
    </LocalizedLink>
  );
}

export function CityDiscoveryLead({
  cityId,
  cityName,
  timeZone,
  imageUrl,
  imageMetadata,
  events,
  venues,
  safety,
  facts,
  map,
}: {
  cityId: string;
  cityName: string;
  timeZone?: string | null;
  imageUrl?: string | null;
  imageMetadata?: unknown;
  events: Event[];
  venues: Venue[];
  safety: ReactNode;
  facts: ReactNode;
  map?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const [openedAt] = useState(Date.now);
  const event = selectDiscoveryEvent(
    events.filter((item) => item.city_id === cityId),
    openedAt,
  );
  const localVenues = venues.filter(
    (venue) => venue.city_id === cityId && !venue.closed_at && !venue.closed_on,
  );
  const community = localVenues.find((venue) => venue.category === 'community');
  const place =
    community ||
    localVenues.find((venue) => ['cafe', 'restaurant', 'bar'].includes(venue.category));
  const metadata = imageMetadata as
    { attribution?: string; photographer?: string; license?: string } | null | undefined;
  const date = event
    ? new Intl.DateTimeFormat(i18n.language, {
        timeZone: destinationTimezone(timeZone),
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(new Date(event.start_date))
    : null;

  return (
    <section aria-label="Overview" className="grid min-w-0 gap-4">
      <div
        className={cn(
          'grid min-w-0 gap-6 rounded-panel bg-surface-container p-4 sm:p-6',
          map && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]',
        )}
      >
        <div className="flex min-w-0 flex-col gap-4">
          {(event || place) && (
            <h2 className="font-display text-headline leading-tight">
              {t('cities.detail.section.nearby', 'Nearby')}
            </h2>
          )}
          {(event || place) && (
            <ul className="divide-y divide-border-hairline">
              {event && (
                <li>
                  <CityStop
                    to={`/events/${event.slug || event.id}`}
                    icon="events"
                    label={
                      <>
                        {t('home.cityFeature.whatsOn', 'What’s on')}
                        {' · '}
                        <time dateTime={event.start_date}>{date}</time>
                      </>
                    }
                  >
                    {localizedField(event.title, event.title_i18n as I18nMap, i18n.language)}
                  </CityStop>
                </li>
              )}
              {place && (
                <li>
                  <CityStop
                    to={`/venues/${place.slug || place.id}`}
                    icon="map"
                    label={
                      community
                        ? t('home.cityFeature.communitySpace', 'Community space')
                        : t('cities.detail.section.venues', 'Where to go')
                    }
                  >
                    {localizedField(place.name, place.name_i18n as I18nMap, i18n.language)}
                  </CityStop>
                </li>
              )}
            </ul>
          )}
          {safety}
        </div>
        {map}
      </div>
      <div
        className={cn(
          'grid min-w-0 items-start gap-4 border-y border-border-hairline py-4 empty:hidden',
          imageUrl && 'sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] sm:gap-6',
        )}
      >
        {imageUrl && (
          <figure className="relative m-0 overflow-hidden rounded-panel">
            <Image
              src={imageUrl}
              alt={cityName}
              aspect="hero"
              rounded="none"
              priority
              sizes="(min-width: 640px) 25vw, 92vw"
            />
            {(metadata?.attribution || metadata?.photographer || metadata?.license) && (
              <figcaption className="absolute bottom-2 start-2 max-w-[calc(100%-1rem)]">
                <ImageCredit
                  attribution={metadata.attribution || metadata.photographer}
                  license={metadata.license}
                  className="inline-block rounded-badge bg-card px-2 py-1"
                />
              </figcaption>
            )}
          </figure>
        )}
        {facts}
      </div>
    </section>
  );
}
