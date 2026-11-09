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
      className="group flex min-h-14 items-center gap-4 py-2 no-underline outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <TransitIcon name={icon} size={20} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-13 text-muted-foreground">{label}</span>
        <span className="block break-words text-15 font-bold group-hover:underline">
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
}: {
  cityId: string;
  cityName: string;
  timeZone?: string | null;
  imageUrl?: string | null;
  imageMetadata?: unknown;
  events: Event[];
  venues: Venue[];
  safety: ReactNode;
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
    <div
      className={
        imageUrl ? 'grid gap-4 lg:col-span-full lg:grid-cols-2 lg:gap-6' : 'lg:col-span-full'
      }
    >
      <div className="flex min-w-0 flex-col gap-2">
        {safety}
        {(event || place) && (
          <ul className="divide-y divide-border-hairline">
            {event && (
              <li>
                <CityStop
                  to={`/events/${event.slug || event.id}`}
                  icon="events"
                  label={<time dateTime={event.start_date}>{date}</time>}
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
      </div>
      {imageUrl && (
        <figure className="relative m-0 min-w-0 self-start overflow-hidden rounded-panel">
          <Image
            src={imageUrl}
            alt={cityName}
            aspect="hero"
            rounded="none"
            priority
            sizes="(min-width: 1600px) 800px, (min-width: 1024px) 46vw, 92vw"
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
    </div>
  );
}
