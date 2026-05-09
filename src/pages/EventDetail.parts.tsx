import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { format } from 'date-fns';
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  DollarSign,
  ExternalLink,
  Phone,
  Globe,
  Share2,
  Send,
  Download,
  Tag,
  Music,
  Luggage,
  Navigation2,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { EntityMap } from '@/components/map/EntityMap';
import EqualityScoreBadge from '@/components/country/EqualityScoreBadge';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { fetchEventBySlugOrId } from '@/hooks/usePageFetchers';
import { formatEventTime } from '@/lib/event-time';
import { formatCurrency } from '@/lib/currency';
import { isMeaningfulTag } from '@/utils/eventText';

export type EventWithRelations = Database['public']['Tables']['events']['Row'] & {
  venues?: {
    id: string;
    slug?: string;
    name: string;
    address: string;
    city: string;
    state: string | null;
    country: string;
    phone: string | null;
    website: string | null;
    email: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  cities?: { id: string; slug?: string; name: string } | null;
  countries?: {
    id: string;
    slug?: string;
    name: string;
    equality_score: number | null;
    lgbti_criminalization: Record<string, unknown> | null;
  } | null;
  festivals?: { id: string; name: string } | null;
  organizer?: {
    id: string;
    slug?: string;
    name: string;
    website: string | null;
    email: string | null;
    instagram: string | null;
    phone: string | null;
    organizer_handles: Record<string, string> | null;
  } | null;
  organizer?: {
    id: string;
    slug?: string;
    name: string;
    website: string | null;
    email: string | null;
    instagram: string | null;
    phone: string | null;
    organizer_handles: Record<string, string> | null;
  } | null;
  event_attendees?: Array<{
    id: string;
    status: string;
    user_id: string;
    profiles?: {
      display_name: string;
      avatar_url: string | null;
    };
  }>;
};

export const EVENT_SELECT_FIELDS = `
  *,
  venues!venue_id(id, slug, name, address, city, state, country, phone, website, email, latitude, longitude),
  cities:city_id(id, slug, name),
  countries:country_id(id, slug, name, equality_score, lgbti_criminalization),
  festivals:festival_id(id, name),
  organizer:venues!organizer_id(id, slug, name, website, email, instagram, phone, organizer_handles)
`;

export async function fetchEvent(
  slug: string,
  userId: string | undefined,
): Promise<EventWithRelations | null> {
  return fetchEventBySlugOrId<EventWithRelations>(slug, EVENT_SELECT_FIELDS, userId);
}

export async function exportEventToCalendar(event: EventWithRelations) {
  const { data, error } = await supabase.functions.invoke('calendar-export', {
    body: { eventId: event.id },
  });
  if (error) throw error;
  const blob = new Blob([data], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatEventDate(startDate: string, endDate?: string | null) {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  if (end && format(start, 'yyyy-MM-dd') !== format(end, 'yyyy-MM-dd')) {
    return `${format(start, 'EEE, MMM d')} - ${format(end, 'EEE, MMM d, yyyy')}`;
  }
  return format(start, 'EEEE, MMMM d, yyyy');
}

export function getPriceDisplay(event: EventWithRelations) {
  if (event.is_free) return 'Free';
  if (event.price_min && event.price_max) {
    return event.price_min === event.price_max
      ? formatCurrency(event.price_min, event.currency)
      : `${formatCurrency(event.price_min, event.currency)} - ${formatCurrency(event.price_max, event.currency)}`;
  }
  if (event.price_min) return `From ${formatCurrency(event.price_min, event.currency)}`;
  return 'Price TBA';
}

interface HeroProps {
  event: EventWithRelations;
  cityName: string | null | undefined;
  countryName: string | null | undefined;
  cityLink: string | null;
  countryLink: string | null;
  isPast: boolean;
  showEventTz: boolean;
  setShowEventTz: (fn: (prev: boolean) => boolean) => void;
  venueRef: RefObject<HTMLDivElement>;
  tripCount?: number;
  isInTrip?: boolean;
  onAddToTrip: () => void;
  onShare: () => void;
  onExportToCalendar: () => void;
  onSendEvent: () => void;
  showSendButton: boolean;
  heroImage: string | null;
  locationLabel: string;
}

export function EventHero({
  event,
  cityName,
  countryName,
  cityLink,
  countryLink,
  isPast,
  showEventTz,
  setShowEventTz,
  venueRef,
  tripCount,
  isInTrip,
  onAddToTrip,
  onShare,
  onExportToCalendar,
  onSendEvent,
  showSendButton,
  heroImage,
  locationLabel,
}: HeroProps) {
  const { t } = useTranslation();
  return (
    <>
      {heroImage && (
        <div className="w-full h-40 md:h-48 rounded-2xl overflow-hidden mb-6">
          <img
            src={heroImage}
            alt={event.title}
            className="w-full h-full object-cover"
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {event.countries?.lgbti_criminalization && (
        <SafetyAlertBanner
          criminalization={event.countries.lgbti_criminalization}
          countryName={event.countries.name}
        />
      )}

      {isPast && (
        <Alert className="mb-6">
          <AlertDescription>
            {t('pages.eventDetail.pastEvent', 'This event has ended.')}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap pl-[2px]">
            {event.logo_url && (
              <img
                src={event.logo_url}
                alt=""
                className="object-contain flex-shrink-0"
                style={{ width: 40, height: 40, borderRadius: '10px', padding: '3px' }}
                onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <h1 className="text-2xl font-bold min-w-0 flex-[1_1_100%] sm:flex-[1_1_auto] break-words pl-[1px]" style={{ overflowWrap: 'anywhere' }}>
              {event.title}
            </h1>
            {event.is_featured && (
              <Badge style={{ backgroundColor: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}>Featured</Badge>
            )}
            {event.countries?.equality_score != null && (
              <EqualityScoreBadge score={event.countries.equality_score} size="sm" />
            )}
          </div>
          {event.festivals?.id && (
            <div className="flex items-center gap-1 mb-1">
              <Music style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }} />
              <span className="text-sm text-muted-foreground">
                Part of <span className="text-sm font-semibold">{event.festivals.name}</span>
              </span>
            </div>
          )}
          <div className="flex items-center gap-1 mb-2">
            <MapPin style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
            <span className="text-sm text-muted-foreground">
              {event.venues?.id ? (
                <LocalizedLink
                  to={`/venues/${event.venues.slug || event.venues.id}`}
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <span className="text-sm hover:text-primary hover:underline">
                    {event.venues.name}
                  </span>
                </LocalizedLink>
              ) : (
                event.venue_name || ''
              )}
              {cityName && (
                <>
                  {event.venues?.name || event.venue_name ? ', ' : ''}
                  {cityLink ? (
                    <LocalizedLink to={cityLink} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <span className="text-sm hover:text-primary hover:underline">{cityName}</span>
                    </LocalizedLink>
                  ) : (
                    cityName
                  )}
                </>
              )}
              {countryName && (
                <>
                  {', '}
                  {countryLink ? (
                    <LocalizedLink to={countryLink} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <span className="text-sm hover:text-primary hover:underline">
                        {countryName}
                      </span>
                    </LocalizedLink>
                  ) : (
                    countryName
                  )}
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <FavoriteButton itemId={event.id} type="event" size="md" />
          {!isPast && (
            <Button variant="outline" size="sm" onClick={onAddToTrip}>
              <Luggage style={{ width: 14, height: 14, marginRight: 6 }} />
              Add to Trip
            </Button>
          )}
          {!isPast && isInTrip && (
            <Badge variant="secondary">
              In {tripCount} trip{tripCount !== 1 ? 's' : ''}
            </Badge>
          )}
          <ReportButton contentType="events" contentId={event.id} contentName={event.title} />
          <AdminEditButton
            contentType="events"
            contentId={event.id}
            contentName={event.title}
            currentData={event as Record<string, unknown>}
            onSaved={() => window.location.reload()}
          />
          {event.ticket_url && (
            <Button size="sm" asChild>
              <a href={event.ticket_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink style={{ width: 16, height: 16, marginRight: 8 }} />
                Get Tickets
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onExportToCalendar}>
            <Download style={{ width: 16, height: 16, marginRight: 6 }} />
            Calendar
          </Button>
          <Button variant="outline" size="sm" onClick={onShare}>
            <Share2 style={{ width: 16, height: 16, marginRight: 6 }} />
            Share
          </Button>
          {showSendButton && (
            <Button variant="outline" size="sm" onClick={onSendEvent}>
              <Send style={{ width: 16, height: 16, marginRight: 6 }} />
              Send
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <Badge variant="outline" className="gap-1">
          <Calendar style={{ width: 14, height: 14 }} />
          {formatEventDate(event.start_date, event.end_date)}
        </Badge>
        <Badge
          variant="outline"
          className={`gap-1 ${event.timezone ? 'cursor-pointer' : ''}`}
          onClick={event.timezone ? () => setShowEventTz((prev) => !prev) : undefined}
          title={
            event.timezone
              ? `Click to toggle between event timezone and your local time`
              : undefined
          }
        >
          <Clock style={{ width: 14, height: 14 }} />
          {formatEventTime(event.start_date, event.end_date, showEventTz ? event.timezone : null)}
        </Badge>
        <Badge
          variant="outline"
          className="gap-1 cursor-pointer"
          onClick={() => venueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        >
          <MapPin style={{ width: 14, height: 14 }} />
          {locationLabel}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <DollarSign style={{ width: 14, height: 14 }} />
          {getPriceDisplay(event)}
        </Badge>
        {isMeaningfulTag(event.event_type) && (
          <Badge className="gap-1 capitalize">
            <Tag style={{ width: 14, height: 14 }} />
            {event.event_type}
          </Badge>
        )}
        {event.age_restriction && (
          <Badge variant="outline">{event.age_restriction}</Badge>
        )}
      </div>

      {(() => {
        const priceUnknown = !event.is_free && !event.price_min;
        const locationUnknown = !(event.venues?.name || event.venue_name);
        const sourceUrl = event.website || event.ticket_url;
        if ((!priceUnknown && !locationUnknown) || !sourceUrl) return null;
        const missing = [priceUnknown && 'price', locationUnknown && 'location']
          .filter(Boolean)
          .join(' and ');
        return (
          <div className="flex flex-wrap items-center gap-3 mb-6 p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              {missing.charAt(0).toUpperCase() + missing.slice(1)} not listed yet —
              check the source for the latest info.
            </p>
            <Button size="sm" variant="outline" asChild>
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink style={{ width: 14, height: 14, marginRight: 6 }} />
                Visit source
              </a>
            </Button>
          </div>
        );
      })()}
    </>
  );
}

interface OverviewProps {
  event: EventWithRelations;
  user: { id: string } | null;
  isPast: boolean;
  userAttendance: string | null;
  onAttendanceUpdate: (status: 'going' | 'interested' | 'not_going') => void;
}

export function EventOverview({
  event,
  user,
  isPast,
  userAttendance,
  onAttendanceUpdate,
}: OverviewProps) {
  const attendeesGoing = event.event_attendees?.filter((a) => a.status === 'going') || [];
  const attendeesInterested = event.event_attendees?.filter((a) => a.status === 'interested') || [];

  return (
    <div className="flex flex-col gap-6">
      {event.description && (
        <Card>
          <CardHeader>
            <CardTitle>About This Event</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap" style={{ lineHeight: 1.7 }}>
              {event.description}
            </p>
          </CardContent>
        </Card>
      )}

      {user && !isPast && (
        <Card>
          <CardContent style={{ paddingTop: 24 }}>
            <div className="flex gap-3">
              <Button
                variant={userAttendance === 'going' ? 'default' : 'outline'}
                onClick={() => onAttendanceUpdate('going')}
                style={{ flex: 1 }}
              >
                <Users style={{ width: 16, height: 16, marginRight: 8 }} />
                Going {userAttendance === 'going' && '✓'}
              </Button>
              <Button
                variant={userAttendance === 'interested' ? 'default' : 'outline'}
                onClick={() => onAttendanceUpdate('interested')}
                style={{ flex: 1 }}
              >
                <Users style={{ width: 16, height: 16, marginRight: 8 }} />
                Interested {userAttendance === 'interested' && '✓'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {user && (attendeesGoing.length > 0 || attendeesInterested.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>
              Attendees ({attendeesGoing.length} going, {attendeesInterested.length} interested)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {attendeesGoing.length > 0 && (
              <div className={attendeesInterested.length > 0 ? 'mb-4' : ''}>
                <p className="text-sm font-medium mb-2">Going</p>
                <div className="flex flex-wrap gap-2">
                  {attendeesGoing.slice(0, 12).map((attendee) => (
                    <div
                      key={attendee.id}
                      className="flex items-center gap-2 bg-muted rounded-full px-3 py-1"
                    >
                      <div
                        className="bg-primary text-primary-foreground rounded-full flex items-center justify-center"
                        style={{ width: 24, height: 24, fontSize: 12 }}
                      >
                        {attendee.profiles?.display_name?.[0] || 'U'}
                      </div>
                      <span className="text-xs">
                        {attendee.profiles?.display_name || 'Anonymous'}
                      </span>
                    </div>
                  ))}
                  {attendeesGoing.length > 12 && (
                    <span className="text-xs text-muted-foreground px-3 py-1">
                      +{attendeesGoing.length - 12} more
                    </span>
                  )}
                </div>
              </div>
            )}
            {attendeesInterested.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Interested</p>
                <div className="flex flex-wrap gap-2">
                  {attendeesInterested.slice(0, 8).map((attendee) => (
                    <div
                      key={attendee.id}
                      className="flex items-center gap-2 bg-muted rounded-full px-3 py-1"
                    >
                      <div
                        className="bg-muted rounded-full flex items-center justify-center"
                        style={{ width: 24, height: 24, fontSize: 12 }}
                      >
                        {attendee.profiles?.display_name?.[0] || 'U'}
                      </div>
                      <span className="text-xs">
                        {attendee.profiles?.display_name || 'Anonymous'}
                      </span>
                    </div>
                  ))}
                  {attendeesInterested.length > 8 && (
                    <span className="text-xs text-muted-foreground px-3 py-1">
                      +{attendeesInterested.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface SidebarProps {
  event: EventWithRelations;
  venueRef: RefObject<HTMLDivElement>;
  onOrganizerClick: (organizer: string) => void;
}

export function EventSidebar({ event, venueRef, onOrganizerClick }: SidebarProps) {
  const lat = event.latitude ?? event.venues?.latitude;
  const lng = event.longitude ?? event.venues?.longitude;
  // Hide the map when no venue / venue_name is set, even if we happen to have
  // raw coords — leaking a precise pin while showing "Location TBA" in the
  // header confuses users and can leak the host's address before reveal.
  const hasNamedVenue = Boolean(event.venues?.name || event.venue_name);
  const hasMap = hasNamedVenue && typeof lat === 'number' && typeof lng === 'number';

  return (
    <div className="flex flex-col gap-6">
      {hasMap && (
        <Card ref={venueRef}>
          <CardContent>
            <EntityMap
              center={[Number(lng), Number(lat)]}
              zoom={15}
              height={200}
              markers={[
                {
                  id: event.id,
                  lat: Number(lat),
                  lng: Number(lng),
                  name: event.title ?? 'Event',
                  subtitle: event.venues?.name,
                  type: 'events',
                  primary: true,
                },
              ]}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Event Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Calendar style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
            <span className="text-sm">{formatEventDate(event.start_date, event.end_date)}</span>
          </div>
          <div className="flex items-center gap-3">
            <Clock style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
            <span className="text-sm">{formatEventTime(event.start_date, event.end_date)}</span>
          </div>
          <div className="flex items-center gap-3">
            <DollarSign style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
            <span className="text-sm font-medium">{getPriceDisplay(event)}</span>
          </div>
          {event.max_attendees && (
            <div className="flex items-center gap-3">
              <Users style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
              <span className="text-sm">Max {event.max_attendees} attendees</span>
            </div>
          )}
          {(event.organizer || event.organizer_name) && (
            <div className="mt-2 pt-3 border-t border-border">
              <p className="text-sm font-medium mb-1">Organizer</p>
              {event.organizer ? (
                <>
                  <LocalizedLink
                    to={`/venues/${event.organizer.slug || event.organizer.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {event.organizer.name}
                  </LocalizedLink>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(event.organizer.website || event.organizer.organizer_handles?.website) && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={event.organizer.website || event.organizer.organizer_handles?.website} target="_blank" rel="noopener noreferrer">
                          <Globe style={{ width: 14, height: 14, marginRight: 6 }} />
                          Website
                        </a>
                      </Button>
                    )}
                    {(event.organizer.instagram || event.organizer.organizer_handles?.instagram) && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`https://instagram.com/${(event.organizer.instagram || event.organizer.organizer_handles?.instagram || '').replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer">
                          Instagram
                        </a>
                      </Button>
                    )}
                    {event.organizer.organizer_handles?.telegram && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`https://t.me/${event.organizer.organizer_handles.telegram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer">
                          Telegram
                        </a>
                      </Button>
                    )}
                    {event.organizer.organizer_handles?.bluesky && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`https://bsky.app/profile/${event.organizer.organizer_handles.bluesky.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer">
                          Bluesky
                        </a>
                      </Button>
                    )}
                    {event.organizer.email && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`mailto:${event.organizer.email}`}>
                          Email
                        </a>
                      </Button>
                    )}
                    {event.organizer.phone && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`tel:${event.organizer.phone}`}>
                          <Phone style={{ width: 14, height: 14, marginRight: 6 }} />
                          Call
                        </a>
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={() => onOrganizerClick(event.organizer_name!)}
                    className="text-sm text-primary hover:underline text-left border-0 bg-transparent cursor-pointer p-0"
                  >
                    {event.organizer_name}
                  </button>
                  {event.organizer_contact && (
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {event.organizer_contact}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {(event.website || event.ticket_url) && (
        <Card>
          <CardHeader>
            <CardTitle>Links</CardTitle>
          </CardHeader>
          <CardContent>
            {event.website && (
              <Button
                variant="outline"
                size="sm"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                asChild
              >
                <a href={event.website} target="_blank" rel="noopener noreferrer">
                  <Globe style={{ width: 16, height: 16, marginRight: 8 }} />
                  Event Website
                </a>
              </Button>
            )}
            {event.ticket_url && (
              <Button
                variant="outline"
                size="sm"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                asChild
              >
                <a href={event.ticket_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink style={{ width: 16, height: 16, marginRight: 8 }} />
                  Get Tickets
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {event.venues && (
        <Card>
          <CardHeader>
            <CardTitle>Venue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{event.venues.name}</p>
            <p className="text-sm text-muted-foreground">
              {event.venues.address}
              <br />
              {event.venues.city}
              {event.venues.state ? `, ${event.venues.state}` : ''} {event.venues.country}
            </p>
            <div className="flex gap-2 mt-1 flex-wrap">
              {hasMap && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Navigation2 style={{ width: 14, height: 14, marginRight: 6 }} />
                    Directions
                  </a>
                </Button>
              )}
              {event.venues.phone && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:${event.venues.phone}`}>
                    <Phone style={{ width: 14, height: 14, marginRight: 6 }} />
                    Call
                  </a>
                </Button>
              )}
              <LocalizedLink to={`/venues/${event.venues.slug || event.venues.id}`}>
                <Button variant="outline" size="sm">
                  View Venue
                </Button>
              </LocalizedLink>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
