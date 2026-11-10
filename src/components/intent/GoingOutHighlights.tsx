import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { Image } from '@/components/ui/Image';
import {
  NIGHTLIFE_CATEGORIES,
  type EventsWithFallback,
  type IntentVenue,
} from '@/hooks/useIntentData';
import { useFeaturedVenue } from '@/hooks/useVenuesV2Data';
import { selectDiscoveryEvent } from '@/lib/discoveryEvent';
import { isValidImageUrl, resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { useVenueCategoryLabel } from '@/lib/venueCategories';
import { venueClosureLabel } from '@/lib/venueClosureLabel';
import { getVenueVisual } from '@/lib/venueVisual';
import { isValidTimezone } from '@/utils/timezone';

function Highlight({
  kind,
  label,
  title,
  to,
  detail,
  image,
  fit,
  plate,
}: {
  kind: 'event' | 'venue';
  label: string;
  title: string;
  to: string;
  detail: ReactNode;
  image?: string | null;
  fit?: 'cover' | 'contain';
  plate?: 'ink' | 'paper';
}) {
  const bullet = <RouteBullet type={kind} size={34} decorative />;
  return (
    <LocalizedLink
      to={to}
      className="group flex min-w-0 items-center gap-4 rounded-container bg-card p-4 no-underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
    >
      {image ? (
        <div className="w-16 shrink-0 overflow-hidden rounded-element sm:w-20">
          <Image
            src={image}
            alt=""
            aspect="square"
            fit={fit}
            plate={plate}
            rounded="none"
            imageRole="thumb"
            className={fit === 'contain' ? 'p-1' : undefined}
            sizes="80px"
            priority
            fallbackArtwork={<div className="grid h-full place-items-center">{bullet}</div>}
          />
        </div>
      ) : (
        <span className="shrink-0">
          {bullet}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-13 text-muted-foreground">{label}</p>
        <h2 className="mt-1 break-words font-sans text-title font-bold leading-tight group-hover:underline sm:text-headline rtl:font-sans rtl:font-bold">
          {title}
        </h2>
        <p className="mt-1 break-words text-13 text-muted-foreground">{detail}</p>
      </div>
      <ArrowRight size={16} aria-hidden className="shrink-0 rtl:rotate-180" />
    </LocalizedLink>
  );
}

const nightlifeCategories = new Set<string>(NIGHTLIFE_CATEGORIES);
const eveningCategories = new Set(['bar', 'club', 'event-venue']);

export function GoingOutHighlights({
  venues,
  eventsResult,
  cityName,
  waitingForVenues,
}: {
  venues?: IntentVenue[];
  eventsResult?: EventsWithFallback;
  cityName: string | null;
  waitingForVenues: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [openedAt] = useState(Date.now);
  const localVenues = venues?.filter((venue) => !venue.safety_gated && !venueClosureLabel(venue));
  const eveningVenues = localVenues?.filter((venue) => eveningCategories.has(venue.category ?? ''));
  const candidates = eveningVenues?.length ? eveningVenues : localVenues;
  const localVenue =
    candidates?.find((venue) => venue.images?.some(isValidImageUrl) || venue.logo_url) ??
    candidates?.[0];

  const showFeatured = !waitingForVenues && !localVenue;
  const { venue: featured } = useFeaturedVenue(showFeatured);
  const featuredVenue =
    showFeatured &&
    featured?.city &&
    !featured.safety_gated &&
    nightlifeCategories.has(featured.category) &&
    !venueClosureLabel(featured)
      ? featured
      : null;
  const venue = localVenue ?? featuredVenue;
  const category = useVenueCategoryLabel(venue?.category);
  const photo = venue?.images?.find(isValidImageUrl);
  const visual = getVenueVisual(venue);

  const elsewhere = eventsResult?.window === 'anywhere';
  const event = selectDiscoveryEvent(
    (eventsResult?.events ?? []).filter((item) => !elsewhere || Boolean(item.city)),
    openedAt,
  );
  const eventCity = event?.city || (!elsewhere ? cityName : null);
  const date = event
    ? new Intl.DateTimeFormat(i18n.language, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: event.timezone && isValidTimezone(event.timezone) ? event.timezone : undefined,
      }).format(new Date(event.start_date))
    : null;

  const eventLink = event && (
    <Highlight
      kind="event"
      label={
        elsewhere && cityName
          ? t('home.discovery.otherEvents', 'Events elsewhere')
          : t('people.sections.whatsOn', "What's on")
      }
      title={event.title}
      to={`/events/${event.slug || event.id}`}
      detail={
        <>
          <time dateTime={event.start_date}>{date}</time>
          {eventCity && ` · ${eventCity}`}
        </>
      }
      image={resolveEntityImage('event', event).url}
    />
  );
  const venueLink = venue && (
    <Highlight
      kind="venue"
      label={
        localVenue
          ? t('cities.detail.section.venues', 'Where to go')
          : t('venues.hero.label', 'Featured venue')
      }
      title={venue.name}
      to={`/venues/${venue.slug || venue.id}`}
      detail={[category, localVenue ? cityName || venue.city : venue.city]
        .filter(Boolean)
        .join(' · ')}
      image={visual.isLogo ? visual.src : photo}
      fit="contain"
      plate={visual.plate ?? undefined}
    />
  );

  if (!eventLink && !venueLink) return null;

  return (
    <div className="grid min-w-0 gap-2">
      {elsewhere && localVenue ? (
        <>
          {venueLink}
          {eventLink}
        </>
      ) : (
        <>
          {eventLink}
          {venueLink}
        </>
      )}
    </div>
  );
}
