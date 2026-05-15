import React, { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/currency';
import { Card, CardImage, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  DollarSign,
  ExternalLink,
  Star,
  Ticket,
  Heart,
  Eye,
  MoreVertical,
  Share2,
  Luggage,
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { format } from 'date-fns';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { formatEventTime } from '@/lib/event-time';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { Skeleton } from 'boneyard-js/react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { AddToTripMenuItem } from '@/components/trips/AddToTripMenuItem';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { rangesOverlap } from '@/components/trips/tripOverlap';
import { ContentLangBadge } from '@/components/i18n/ContentLangBadge';
import { isMeaningfulTag, sanitizeExcerpt } from '@/utils/eventText';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';

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
    event_attendees?: Array<{ status: string }>;
  };
  loading?: boolean;
  onViewDetails?: (event: Event) => void;
  onUpdateAttendance?: (eventId: string, status: 'going' | 'interested' | 'not_going') => void;
}

const EventCardFixture = () => (
  <Card hoverable>
    <CardImage src="" alt="Event" fallbackIcon={Calendar} height={200} />
    <CardHeader>
      <CardTitle>Sample Event Title</CardTitle>
      <div className="flex gap-1.5">
        <div className="flex items-center gap-1 px-1.5 py-1 bg-muted rounded-element">
          <Calendar className="h-4 w-4" />
          <span className="text-sm font-medium">Jun 15, 2026</span>
        </div>
        <div className="flex items-center gap-1 px-1.5 py-1 bg-muted rounded-element">
          <Clock className="h-4 w-4" />
          <span className="text-sm">8:00 PM</span>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">A sample event description spanning a couple of lines.</p>
      <div className="flex items-start gap-1 p-1.5 bg-muted rounded-element">
        <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">Sample Venue</p>
          <span className="text-xs text-muted-foreground">Berlin, Germany</span>
        </div>
      </div>
      <div className="flex items-center justify-between py-1">
        <p className="text-sm font-medium">12 attending</p>
        <div className="w-8 h-8" />
      </div>
    </CardContent>
  </Card>
);

export const EventCard = memo(function EventCard({
  event,
  loading = false,
  onUpdateAttendance,
}: EventCardProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: tripStatus } = useEntityTripStatus('event', event?.id);
  const { activeTrip } = useActiveTrip();
  const overlapsActiveTrip =
    !!activeTrip &&
    !tripStatus?.isInTrip &&
    rangesOverlap(
      { start_date: event?.start_date, end_date: event?.end_date },
      { start_date: activeTrip.start_date, end_date: activeTrip.end_date },
    );
  const attendeeCount = event?.event_attendees?.filter((a) => a.status === 'going').length || 0;
  const isPast = !!event && new Date(event.end_date ?? event.start_date) < new Date();
  const resolvedImage = resolveEntityImage('event', event ?? null).url;
  const [imageError, setImageError] = React.useState(false);
  const hasImage = !!resolvedImage && !imageError;
  const hasVenue = event?.venues?.name || event?.venue_name;
  const hasLocation = hasVenue || event?.city;

  const getEventTypeStyle = (type: string): React.CSSProperties => {
    const styles: Record<string, React.CSSProperties> = {
      party: { backgroundColor: 'rgba(var(--primary-rgb), 0.1)', color: 'hsl(var(--primary))' },
      workshop: { backgroundColor: 'rgba(var(--accent-rgb), 0.1)', color: 'var(--accent)' },
      meetup: { backgroundColor: 'rgba(var(--secondary-rgb), 0.1)', color: 'var(--secondary)' },
      pride: { backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' },
      rally: { backgroundColor: 'rgba(var(--destructive-rgb), 0.1)', color: 'var(--destructive)' },
    };
    return (
      styles[type] || {
        backgroundColor: 'rgba(var(--muted-rgb), 0.1)',
        color: 'var(--muted-foreground)',
      }
    );
  };

  const formatEventDate = (startDate: string, endDate?: string | null) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;

    if (end && format(start, 'yyyy-MM-dd') !== format(end, 'yyyy-MM-dd')) {
      return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
    }
    return format(start, 'MMM d, yyyy');
  };

  const getPriceDisplay = () => {
    if (!event) return null;
    if (event.is_free) return 'Free';
    if (event.price_min && event.price_max) {
      if (event.price_min === event.price_max) {
        return formatCurrency(event.price_min, event.currency);
      }
      return `${formatCurrency(event.price_min, event.currency)} - ${formatCurrency(event.price_max, event.currency)}`;
    }
    if (event.price_min) return `From ${formatCurrency(event.price_min, event.currency)}`;
    return null;
  };

  const priceDisplay = event ? getPriceDisplay() : null;
  const locationLabel = [event?.city, event?.state].filter(Boolean).join(', ');

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
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <CardHoverEffect>
          <Card hoverable className="group">
            {/* Image */}
            {hasImage && (
              <div className="relative h-[200px] overflow-hidden">
                <img
                  src={resolvedImage ?? ''}
                  alt={event.title}
                  loading="lazy"
                  decoding="async"
                  onError={() => setImageError(true)}
                  className="w-full h-full object-cover grayscale-[0.15] transition-all duration-500 ease-out group-hover:grayscale-0 group-hover:scale-[1.04]"
                />
                <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start">
                  <div className="flex gap-1">
                    {tripStatus?.isInTrip && (
                      <div className="flex items-center gap-0.5 bg-primary text-primary-foreground rounded-full px-1 py-0.5 text-[0.7rem] font-semibold">
                        <Luggage className="w-3 h-3" />
                        In trip
                      </div>
                    )}
                    {overlapsActiveTrip && (
                      <div
                        className="flex items-center gap-0.5 bg-background text-primary border border-primary rounded-full px-1 py-0.5 text-[0.7rem] font-semibold"
                        title={`Happens during ${activeTrip?.title}`}
                      >
                        <Calendar className="w-3 h-3" />
                        During your trip
                      </div>
                    )}
                    {event.is_featured && (
                      <Badge>
                        <Star className="h-3 w-3 mr-1" />
                        Featured
                      </Badge>
                    )}
                    {isMeaningfulTag(event.event_type) && (
                      <Badge style={{ ...getEventTypeStyle(event.event_type) }}>
                        {event.event_type}
                      </Badge>
                    )}
                    {isPast && (
                      <Badge variant="secondary" style={{ opacity: 0.7 }}>
                        {t('events.past', 'Past')}
                      </Badge>
                    )}
                  </div>

                  {event.images && event.images.length > 1 && (
                    <Badge variant="secondary">+{event.images.length - 1} photos</Badge>
                  )}
                </div>

                {/* Logo overlay */}
                {event.logo_url && (
                  <img
                    src={event.logo_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute bottom-3 left-3 w-8 h-8 rounded-element bg-background object-contain shadow-sm z-20 p-0.5"
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}

                {priceDisplay && (
                  <div className="absolute bottom-4 right-4 z-20">
                    <Badge variant={event.is_free ? 'default' : 'secondary'}>
                      {event.is_free ? (
                        <Ticket className="h-3 w-3 mr-1" />
                      ) : (
                        <DollarSign className="h-3 w-3 mr-1" />
                      )}
                      {priceDisplay}
                    </Badge>
                  </div>
                )}
              </div>
            )}

            <CardHeader>
              {!hasImage && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {tripStatus?.isInTrip && (
                    <Badge>
                      <Luggage className="h-3 w-3 mr-1" />
                      In trip
                    </Badge>
                  )}
                  {overlapsActiveTrip && (
                    <Badge variant="outline">
                      <Calendar className="h-3 w-3 mr-1" />
                      During your trip
                    </Badge>
                  )}
                  {event.is_featured && (
                    <Badge>
                      <Star className="h-3 w-3 mr-1" />
                      Featured
                    </Badge>
                  )}
                  {isMeaningfulTag(event.event_type) && (
                    <Badge style={{ ...getEventTypeStyle(event.event_type) }}>
                      {event.event_type}
                    </Badge>
                  )}
                  {priceDisplay && (
                    <Badge variant={event.is_free ? 'default' : 'secondary'}>{priceDisplay}</Badge>
                  )}
                </div>
              )}

              <CardTitle>
                <span className="inline-flex items-center gap-1 flex-wrap">
                  {event.title}
                  <ContentLangBadge text={event.title} language={(event as { content_language?: string | null }).content_language} />
                </span>
              </CardTitle>

              <div className="flex flex-wrap gap-1.5 mt-1">
                <div className="flex items-center gap-1 px-1.5 py-1 bg-muted rounded-element">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
                    {formatEventDate(event.start_date, event.end_date)}
                  </span>
                </div>
                <div className="flex items-center gap-1 px-1.5 py-1 bg-muted rounded-element">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{formatEventTime(event.start_date, event.end_date)}</span>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {sanitizeExcerpt(event.description) && (
                <p
                  className="text-sm text-muted-foreground overflow-hidden break-words"
                  style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', lineHeight: 1.6 }}
                >
                  {sanitizeExcerpt(event.description)}
                </p>
              )}

              {hasLocation && (
                <div
                  className={`flex gap-1 p-1.5 bg-muted rounded-element ${event.venues?.address ? 'items-start' : 'items-center'}`}
                >
                  <MapPin
                    className="h-4 w-4 text-primary flex-shrink-0"
                    style={{ marginTop: event.venues?.address ? 2 : 0 }}
                  />
                  <div className="flex-1 min-w-0">
                    {hasVenue && (
                      <p
                        className="text-sm font-medium overflow-hidden break-words"
                        style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}
                      >
                        {event.venues?.name || event.venue_name}
                      </p>
                    )}
                    {locationLabel && (
                      <span className="text-xs text-muted-foreground">{locationLabel}</span>
                    )}
                    {event.venues?.address && (
                      <span className="text-xs text-muted-foreground mt-0.5 block">
                        {event.venues.address}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  {attendeeCount > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="p-1 bg-muted rounded-element">
                        <Users className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <p className="text-sm font-medium">{attendeeCount} attending</p>
                    </div>
                  )}

                  {event.age_restriction && (
                    <Badge variant="outline">{event.age_restriction}</Badge>
                  )}
                </div>

                <div className="flex items-center gap-0.5">
                  <div onClick={(e) => e.preventDefault()}>
                    <FavoriteButton itemId={event.id} type="event" />
                  </div>
                  <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-11 w-11 min-w-11 min-h-11 p-0"
                        aria-label={t('events.card.moreActions', 'More actions')}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <MoreVertical className="w-4 h-4" aria-hidden="true" focusable="false" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                      <AddToTripMenuItem
                        entity={{
                          type: 'event',
                          id: event.id,
                          name: event.title,
                          latitude: event.latitude,
                          longitude: event.longitude,
                          city_id: event.city_id,
                          country_id: event.country_id,
                          category: event.event_type,
                        }}
                        onClose={() => setMenuOpen(false)}
                      />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setMenuOpen(false);
                          navigator.clipboard.writeText(
                            `${window.location.origin}/events/${event.slug}`,
                          );
                        }}
                      >
                        <Share2 className="w-4 h-4 mr-2" />
                        Share
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex items-center justify-between gap-1 pt-2 border-t border-border">
                <Button size="sm" variant="outline">
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </Button>

                {(event.venues?.website || event.ticket_url) && (
                  <div className="flex gap-0.5 ml-auto">
                    {event.venues?.website && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={t('events.card.visitWebsite', 'Visit venue website')}
                        title={t('events.card.visitWebsite', 'Visit venue website')}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          window.open(event.venues!.website!, '_blank');
                        }}
                        className="min-w-11 min-h-11"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" focusable="false" />
                      </Button>
                    )}
                    {event.ticket_url && (
                      <Button
                        type="button"
                        size="sm"
                        aria-label={t('events.card.getTickets', 'Get tickets')}
                        title={t('events.card.getTickets', 'Get tickets')}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          window.open(event.ticket_url!, '_blank');
                        }}
                        className="min-w-11 min-h-11"
                      >
                        <Ticket className="h-4 w-4 mr-1.5" aria-hidden="true" focusable="false" />
                        {t('events.card.tickets', 'Tickets')}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {onUpdateAttendance && (
                <div className="flex gap-1 pt-1">
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onUpdateAttendance(event.id, 'going');
                    }}
                  >
                    <Heart className="h-4 w-4 mr-2" />
                    I'm Going
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onUpdateAttendance(event.id, 'interested');
                    }}
                  >
                    <Star className="h-4 w-4 mr-2" />
                    Interested
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          </CardHoverEffect>
        </LocalizedLink>
      )}
    </Skeleton>
  );
});
