import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/currency';
import { Card } from '@/components/ui/card';
import { Calendar } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { rangesOverlap } from '@/components/trips/tripOverlap';
import { isMeaningfulTag } from '@/utils/eventText';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import { Image } from '@/components/ui/Image';
import { SocialSignalBar } from '@/components/social/SocialSignalBar';
import { SignalIcons } from '@/components/social/signalIcons';
import { QuietAddToTripButton } from '@/components/trips/QuietAddToTripButton';
import type { EventSocialSignal } from '@/hooks/useEventSocialSignals';

type Event = Database['public']['Tables']['events']['Row'] & {
  venues?: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string | null;
    country: string;
    phone: string | null;
    website: string | null;
    email: string | null;
  } | null;
};

interface EventCardProps {
  event?: Event & {
    attendee_count?: number;
    event_attendees?: Array<{ status: string }>;
  };
  loading?: boolean;
  onViewDetails?: (event: Event) => void;
  onUpdateAttendance?: (eventId: string, status: 'going' | 'interested' | 'not_going') => void;
  /**
   * Optional pre-fetched social signal (friend counts) for this event.
   * List parents that already call useEventSocialSignals can pass the
   * matching row; cards left without this prop still surface the
   * attending_count chip from the event payload alone.
   */
  socialSignal?: EventSocialSignal;
}

const EventCardFixture = () => (
  <Card hoverable className="overflow-hidden">
    <div className="aspect-[16/10] bg-muted" />
    <div className="p-4">
      <p className="text-body-lg font-semibold leading-tight">Sample Event Title</p>
      <p className="mt-1 text-xs text-muted-foreground">Jun 15</p>
    </div>
  </Card>
);

function formatEventDate(startDate: string, endDate?: string | null) {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  if (end && format(start, 'yyyy-MM-dd') !== format(end, 'yyyy-MM-dd')) {
    if (format(start, 'yyyy') === format(end, 'yyyy')) {
      return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
    }
    return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
  }
  return format(start, 'MMM d');
}

export const EventCard = memo(function EventCard({ event, loading = false, socialSignal }: EventCardProps) {
  const { t } = useTranslation();
  const { data: tripStatus } = useEntityTripStatus('event', event?.id);
  const { activeTrip } = useActiveTrip();
  const overlapsActiveTrip =
    !!activeTrip &&
    !tripStatus?.isInTrip &&
    rangesOverlap(
      { start_date: event?.start_date, end_date: event?.end_date },
      { start_date: activeTrip.start_date, end_date: activeTrip.end_date },
    );
  const isPast = !!event && new Date(event.end_date ?? event.start_date) < new Date();
  const resolvedImage = resolveEntityImage('event', event ?? null).url;

  const priceDisplay = (() => {
    if (!event) return null;
    if (event.is_free) return 'Free';
    if (event.price_min && event.price_max) {
      if (event.price_min === event.price_max) return formatCurrency(event.price_min, event.currency);
      return `${formatCurrency(event.price_min, event.currency)} – ${formatCurrency(event.price_max, event.currency)}`;
    }
    if (event.price_min) return `From ${formatCurrency(event.price_min, event.currency)}`;
    return null;
  })();

  // Single overlay slot — priority order
  type Overlay = { label: string; variant: 'past' | 'trip' | 'overlap' | 'featured' };
  const overlay: Overlay | null = isPast
    ? { label: t('events.past', 'Past'), variant: 'past' }
    : tripStatus?.isInTrip
      ? { label: 'In trip', variant: 'trip' }
      : overlapsActiveTrip
        ? { label: 'During your trip', variant: 'overlap' }
        : event?.is_featured
          ? { label: 'Featured', variant: 'featured' }
          : null;

  const overlayClass =
    overlay?.variant === 'past'
      ? 'bg-muted text-muted-foreground'
      : overlay?.variant === 'trip'
        ? 'bg-foreground text-background'
        : overlay?.variant === 'overlap'
          ? 'bg-background text-foreground border border-border'
          : 'bg-foreground/80 text-background';

  const locationLabel = event
    ? [event.venues?.name || event.venue_name, event.city].filter(Boolean).join(', ')
    : '';

  const eventTypeTag =
    event && isMeaningfulTag(event.event_type) ? event.event_type : null;

  return (
    <Skeleton
      name="event-card"
      loading={loading || !event}
      fixture={<EventCardFixture />}
      fallback={<PageLoadingState count={1} />}
    >
      {event && (
        <LocalizedLink
          to={`/events/${event.slug}`}
          style={{ color: 'inherit' }}
          className="block no-underline"
        >
          <CardHoverEffect>
            <Card hoverable className="group overflow-hidden">
              <Image
                src={resolvedImage}
                alt={event.title}
                aspect="card"
                imageRole="cover"
                fallbackEntityType="event"
                fallbackKey={event.id}
              >
                {overlay && (
                  <div
                    className={`absolute top-2 left-2 px-2 py-0.5 rounded-badge text-2xs font-semibold uppercase tracking-wider ${overlayClass}`}
                  >
                    {overlay.label}
                  </div>
                )}

                <div
                  className="absolute top-1 right-1"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  <FavoriteButton itemId={event.id} type="event" size="tap" />
                </div>
                <QuietAddToTripButton
                  className="top-2 right-14"
                  entity={{
                    type: 'event',
                    id: event.id,
                    name: event.title,
                    latitude: event.latitude ? Number(event.latitude) : null,
                    longitude: event.longitude ? Number(event.longitude) : null,
                    city_id: event.city_id ?? null,
                    country_id: event.country_id ?? null,
                    address: event.address ?? null,
                    category: event.event_type ?? null,
                  }}
                />
              </Image>

              <div className="p-4">
                <div className="flex items-baseline gap-2 min-w-0">
                  <p className="text-body-lg font-semibold leading-tight truncate flex-1 min-w-0">
                    {event.title}
                  </p>
                  {priceDisplay && (
                    <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0">
                      {priceDisplay}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground truncate">
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={12} className="shrink-0" />
                    {formatEventDate(event.start_date, event.end_date)}
                  </span>
                  {locationLabel && <> · {locationLabel}</>}
                </p>
                {eventTypeTag && (
                  <p className="mt-2 text-2xs text-muted-foreground truncate capitalize">
                    {eventTypeTag}
                  </p>
                )}
                <SocialSignalBar
                  className="mt-2"
                  signals={[
                    {
                      icon: SignalIcons.friends,
                      count: socialSignal?.friends_going ?? 0,
                      label: 'friends going',
                    },
                    {
                      icon: SignalIcons.going,
                      count: socialSignal?.attending_count ?? event.attendee_count ?? 0,
                      label: 'going',
                    },
                  ]}
                />
              </div>
            </Card>
          </CardHoverEffect>
        </LocalizedLink>
      )}
    </Skeleton>
  );
});
