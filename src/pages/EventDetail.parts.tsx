import { useEffect, useState, type ReactNode, type RefObject } from 'react';
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
  Send,
  Download,
  Ticket,
  Luggage,
  Navigation2,
  Repeat,
  Music,
  ShieldCheck,
  CircleCheck,
  Sparkles,
} from 'lucide-react';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EntitySocialLinks } from '@/components/entity/EntitySocialLinks';
import { ShareMenu } from '@/components/share/ShareMenu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Image } from '@/components/ui/Image';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Editable } from '@/components/admin/inline/Editable';
import { EntityMap } from '@/components/map/EntityMap';
import { MarkVisitedButton } from '@/components/marks/MarkVisitedButton';
import { AmenityDisplay } from '@/components/venues/AmenityDisplay';
import { DestinationSafetyCard } from '@/components/safety/DestinationSafetyCard';
import EqualityScoreBadge from '@/components/country/EqualityScoreBadge';
import { PeopleHereRail } from '@/components/people/PeopleHereRail';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { fetchEventBySlugOrId } from '@/hooks/usePageFetchers';
import { formatEventTime } from '@/lib/event-time';
import { formatCurrency } from '@/lib/currency';
import { isMeaningfulTag } from '@/utils/eventText';
import { useIsMobile } from '@/hooks/use-mobile';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useProfile } from '@/hooks/useProfile';
import { matchNeeds, needLabel } from '@/lib/accessibilityNeeds';
import { getEventLiveState } from '@/lib/event-countdown';

export type EventWithRelations = Database['public']['Tables']['events']['Row'] & {
  social_links?: Record<string, string> | null;
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
  cities?: {
    id: string;
    slug?: string;
    name: string;
    country_id?: string | null;
    countries?: {
      id: string;
      slug?: string;
      name: string;
      equality_score: number | null;
      lgbti_criminalization: Record<string, unknown> | null;
    } | null;
  } | null;
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
  attendee_counts?: { going: number; interested: number };
  user_attendance?: string | null;
};

export const EVENT_SELECT_FIELDS = `
  *,
  venues!venue_id(id, slug, name, address, city, state, country, phone, website, email, latitude, longitude),
  cities:city_id(id, slug, name, country_id, countries:country_id(id, slug, name, equality_score, lgbti_criminalization)),
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

/** Map liveness/status to a header pill. Returns null for routine "scheduled". */
function statusPill(
  event: EventWithRelations,
): { label: string; variant: 'destructive' | 'outline' | 'soft' } | null {
  const s = (event.liveness_status || event.status || '').toLowerCase();
  if (s.includes('cancel')) return { label: 'Cancelled', variant: 'destructive' };
  if (s.includes('postpon')) return { label: 'Postponed', variant: 'destructive' };
  if (s.includes('sold')) return { label: 'Sold out', variant: 'outline' };
  if (s.includes('moved_online') || s === 'online') return { label: 'Moved online', variant: 'soft' };
  return null;
}

function humanizeRecurrence(pattern: string | null | undefined): string {
  if (!pattern) return 'Recurring event';
  const p = pattern.toUpperCase();
  if (p.includes('DAILY')) return 'Repeats daily';
  if (p.includes('WEEKLY')) return 'Repeats weekly';
  if (p.includes('MONTHLY')) return 'Repeats monthly';
  if (p.includes('YEARLY')) return 'Repeats yearly';
  return 'Recurring event';
}

/** The user's accessibility needs this event is known to satisfy (auth-only). */
function useMatchedNeeds(event: EventWithRelations): string[] {
  const { profile } = useProfile();
  const prefs = (profile as { travel_preferences?: { accessibility_needs?: string[] } } | null)
    ?.travel_preferences;
  const needs = Array.isArray(prefs?.accessibility_needs) ? prefs.accessibility_needs : [];
  if (needs.length === 0) return [];
  const { matched } = matchNeeds(event.accessibility_attributes ?? [], needs);
  return matched.map((m) => needLabel(m.need));
}

/* ------------------------------------------------------------------ */
/* Live-state line — ticking countdown / happening-now / ended        */
/* ------------------------------------------------------------------ */

function LiveStateLine({ event }: { event: EventWithRelations }) {
  const reduced = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  const state = getEventLiveState(event.start_date, event.end_date, now);
  const soon = state.kind === 'upcoming' && state.soon;

  useEffect(() => {
    if (state.kind === 'ended') return;
    const ms = reduced ? 60_000 : soon ? 1_000 : 60_000;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [state.kind, soon, reduced]);

  if (!state.label) return null;

  if (state.kind === 'live') {
    return (
      <span className="inline-flex items-center gap-2 text-15 font-medium">
        <span className="relative flex h-2.5 w-2.5">
          {!reduced && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground/40" />
          )}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-foreground" />
        </span>
        {state.label}
      </span>
    );
  }

  if (state.kind === 'ended') {
    return <span className="text-15 text-muted-foreground">{state.label}</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-15 font-medium text-foreground">
      <Clock size={15} aria-hidden="true" />
      {state.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Hero — cover, eyebrow, title, location, live state                  */
/* ------------------------------------------------------------------ */

interface HeroProps {
  event: EventWithRelations;
  cityName: string | null | undefined;
  countryName: string | null | undefined;
  cityLink: string | null;
  countryLink: string | null;
  heroImage: string | null;
  onContentUpdated?: () => void;
}

export function EventHero({
  event,
  cityName,
  countryName,
  cityLink,
  countryLink,
  heroImage,
  onContentUpdated,
}: HeroProps) {
  const isMobile = useIsMobile();
  const pill = statusPill(event);
  const eyebrow = event.festivals?.id
    ? null
    : isMeaningfulTag(event.event_type)
      ? event.event_type
      : null;

  return (
    <>
      <div className="group relative mb-6">
        <Image
          src={heroImage}
          alt={event.title}
          heightPx={isMobile ? 220 : 380}
          imageRole="hero"
          rounded="container"
          scrim={pill || event.is_featured ? 'readable' : 'none'}
          priority
          fallbackEntityType="event"
          fallbackKey={event.id}
        >
          {(pill || event.is_featured) && (
            <div className="absolute right-4 top-4 flex flex-wrap justify-end gap-2">
              {pill && <Badge variant={pill.variant}>{pill.label}</Badge>}
              {event.is_featured && <Badge>Featured</Badge>}
            </div>
          )}
          {event.logo_url && (
            <img
              src={event.logo_url}
              alt=""
              role="presentation"
              referrerPolicy="no-referrer"
              className="absolute bottom-4 left-4 h-12 w-12 rounded-element bg-background/90 object-contain p-1"
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
        </Image>
      </div>

      {event.countries?.lgbti_criminalization && (
        <SafetyAlertBanner
          criminalization={event.countries.lgbti_criminalization}
          countryName={event.countries.name}
        />
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {eyebrow && (
          <Eyebrow as="span" className="capitalize">
            {eyebrow}
          </Eyebrow>
        )}
        {event.festivals?.id && (
          <span className="inline-flex items-center gap-1.5 text-13 text-muted-foreground">
            <Music size={13} aria-hidden="true" />
            Part of <span className="font-semibold text-foreground">{event.festivals.name}</span>
          </span>
        )}
        {event.countries?.equality_score != null && (
          <EqualityScoreBadge score={event.countries.equality_score} size="sm" />
        )}
      </div>

      <h1
        className="m-0 text-display font-bold leading-[1.05] tracking-tight md:text-headline-lg"
        style={{ overflowWrap: 'anywhere' }}
      >
        <Editable
          contentType="events"
          recordId={event.id}
          field="title"
          value={event.title}
          onSaved={onContentUpdated}
        >
          {event.title}
        </Editable>
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-body-lg text-muted-foreground">
          <MapPin size={16} className="shrink-0" aria-hidden="true" />
          <span>
            {event.venues?.id ? (
              <LocalizedLink
                to={`/venues/${event.venues.slug || event.venues.id}`}
                className="hover:underline"
              >
                {event.venues.name}
              </LocalizedLink>
            ) : (
              event.venue_name || ''
            )}
            {cityName && (
              <>
                {event.venues?.name || event.venue_name ? ', ' : ''}
                {cityLink ? (
                  <LocalizedLink to={cityLink} className="hover:underline">
                    {cityName}
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
                  <LocalizedLink to={countryLink} className="hover:underline">
                    {countryName}
                  </LocalizedLink>
                ) : (
                  countryName
                )}
              </>
            )}
          </span>
        </span>
        <LiveStateLine event={event} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Fact strip — date / time / price / ages, the canonical glance       */
/* ------------------------------------------------------------------ */

function FactCell({
  icon: Icon,
  label,
  value,
  onClick,
  title,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={!onClick}
      className={`bg-background p-4 text-left ${onClick ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default'}`}
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon size={13} aria-hidden="true" />
        <Eyebrow as="span">{label}</Eyebrow>
      </span>
      <span className="mt-1 block text-15 font-medium">{value}</span>
    </button>
  );
}

export function EventFactStrip({
  event,
  showEventTz,
  setShowEventTz,
}: {
  event: EventWithRelations;
  showEventTz: boolean;
  setShowEventTz: (fn: (prev: boolean) => boolean) => void;
}) {
  const ageRestriction = event.age_restriction;
  return (
    <div
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-element border border-border bg-border ${
        ageRestriction ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
      }`}
    >
      <FactCell icon={Calendar} label="Date" value={formatEventDate(event.start_date, event.end_date)} />
      <FactCell
        icon={Clock}
        label="Time"
        value={formatEventTime(event.start_date, event.end_date, showEventTz ? event.timezone : null)}
        onClick={event.timezone ? () => setShowEventTz((prev) => !prev) : undefined}
        title={event.timezone ? 'Toggle between event timezone and your local time' : undefined}
      />
      <FactCell icon={DollarSign} label="Price" value={getPriceDisplay(event)} />
      {ageRestriction && <FactCell icon={Users} label="Ages" value={ageRestriction} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* For-you line — auth-aware personalization, only what's true         */
/* ------------------------------------------------------------------ */

export function EventForYou({
  event,
  isInTrip,
  tripCount,
}: {
  event: EventWithRelations;
  isInTrip?: boolean;
  tripCount?: number;
}) {
  const matchedNeeds = useMatchedNeeds(event);
  const chips: ReactNode[] = [];

  if (isInTrip && tripCount) {
    chips.push(
      <Badge key="trip" variant="soft" className="gap-1.5">
        <Luggage size={13} aria-hidden="true" />
        In {tripCount} of your trip{tripCount !== 1 ? 's' : ''}
      </Badge>,
    );
  }
  for (const need of matchedNeeds) {
    chips.push(
      <Badge key={`need-${need}`} variant="secondary" className="gap-1.5 rounded-badge">
        <CircleCheck size={13} aria-hidden="true" />
        Matches your needs: {need}
      </Badge>,
    );
  }

  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-13 text-muted-foreground">
        <Sparkles size={13} aria-hidden="true" />
        For you
      </span>
      {chips}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Decision card — the sticky buy/RSVP/save panel (desktop rail)       */
/* ------------------------------------------------------------------ */

interface DecisionCardProps {
  event: EventWithRelations;
  user: { id: string } | null;
  isPast: boolean;
  userAttendance: string | null;
  onAttendanceUpdate: (status: 'going' | 'interested' | 'not_going') => void;
  onAddToTrip: () => void;
  onExportToCalendar: () => void;
  onSendEvent: () => void;
}

export function EventDecisionCard({
  event,
  user,
  isPast,
  userAttendance,
  onAttendanceUpdate,
  onAddToTrip,
  onExportToCalendar,
  onSendEvent,
}: DecisionCardProps) {
  const ticketHref = event.ticket_url;
  const lat = event.latitude ?? event.venues?.latitude;
  const lng = event.longitude ?? event.venues?.longitude;
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';
  const venueName = event.venues?.name || event.venue_name;

  return (
    <Card className="md:sticky md:top-24">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-headline font-display leading-none">{getPriceDisplay(event)}</span>
          {event.is_free && <Badge variant="soft">No ticket needed</Badge>}
        </div>

        {ticketHref ? (
          <Button asChild className="w-full">
            <a href={ticketHref} target="_blank" rel="noopener noreferrer">
              <Ticket size={16} className="mr-2" />
              Get Tickets
            </a>
          </Button>
        ) : (
          !isPast && (
            <Button className="w-full" onClick={onAddToTrip}>
              <Luggage size={16} className="mr-2" />
              Add to Trip
            </Button>
          )
        )}

        {user && !isPast && (
          <div className="flex gap-2">
            <Button
              variant={userAttendance === 'going' ? 'default' : 'outline'}
              onClick={() => onAttendanceUpdate(userAttendance === 'going' ? 'not_going' : 'going')}
              aria-pressed={userAttendance === 'going'}
              className="flex-1"
            >
              {userAttendance === 'going' && <CircleCheck size={16} className="mr-1.5" />}
              Going
            </Button>
            <Button
              variant={userAttendance === 'interested' ? 'default' : 'outline'}
              onClick={() =>
                onAttendanceUpdate(userAttendance === 'interested' ? 'not_going' : 'interested')
              }
              aria-pressed={userAttendance === 'interested'}
              className="flex-1"
            >
              {userAttendance === 'interested' && <CircleCheck size={16} className="mr-1.5" />}
              Interested
            </Button>
          </div>
        )}

        {ticketHref && !isPast && (
          <Button variant="outline" className="w-full" onClick={onAddToTrip}>
            <Luggage size={16} className="mr-2" />
            Add to Trip
          </Button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <FavoriteButton itemId={event.id} type="event" size="md" />
          <Button variant="outline" size="sm" onClick={onExportToCalendar}>
            <Download size={14} className="mr-1.5" />
            Calendar
          </Button>
          <ShareMenu
            url={
              typeof window !== 'undefined'
                ? window.location.href
                : `https://queer.guide/events/${event.slug ?? event.id}`
            }
            title={event.title}
          />
          {user && (
            <Button variant="outline" size="sm" onClick={onSendEvent}>
              <Send size={14} className="mr-1.5" />
              Send
            </Button>
          )}
        </div>

        <div className="border-t border-border pt-4 text-sm">
          <div className="flex items-start gap-2">
            <Calendar size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <p>{formatEventDate(event.start_date, event.end_date)}</p>
              <p className="text-muted-foreground">
                {formatEventTime(event.start_date, event.end_date)}
              </p>
            </div>
          </div>
          {venueName && (
            <div className="mt-4 flex items-start gap-2">
              <MapPin size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium">{venueName}</p>
                {hasCoords && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <Navigation2 size={13} />
                    Directions
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 border-t border-border pt-4">
          <MarkVisitedButton entityType="event" entityId={event.id} kind="visited" />
          <ReportButton contentType="events" contentId={event.id} contentName={event.title} />
          <AdminEditButton
            contentType="events"
            contentId={event.id}
            contentName={event.title}
            currentData={event as Record<string, unknown>}
            onSaved={() => window.location.reload()}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* About — description, recurrence/festival, accessibility, source     */
/* ------------------------------------------------------------------ */

export function EventAbout({
  event,
  onContentUpdated,
}: {
  event: EventWithRelations;
  onContentUpdated?: () => void;
}) {
  const hasAccessibility =
    (event.accessibility_attributes?.length ?? 0) > 0 || Boolean(event.accessibility_notes);
  const priceUnknown = !event.is_free && !event.price_min;
  const locationUnknown = !(event.venues?.name || event.venue_name);
  const sourceUrl = event.website || event.ticket_url;
  const showSource = (priceUnknown || locationUnknown) && Boolean(sourceUrl);
  const missing = [priceUnknown && 'price', locationUnknown && 'location'].filter(Boolean).join(' and ');

  if (!event.description && !event.is_recurring && !event.festivals?.id && !hasAccessibility && !showSource) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      {event.description && (
        <section>
          <Eyebrow as="div" className="mb-2">
            About this event
          </Eyebrow>
          <Editable
            contentType="events"
            recordId={event.id}
            field="description"
            value={event.description}
            onSaved={onContentUpdated}
            fieldOverride={{ type: 'textarea' }}
            as="div"
          >
            <p
              className="max-w-[68ch] whitespace-pre-wrap text-body-lg text-foreground/90"
              style={{ lineHeight: 1.7 }}
            >
              {event.description}
            </p>
          </Editable>
        </section>
      )}

      {(event.is_recurring || event.festivals?.id) && (
        <div className="flex flex-wrap gap-2">
          {event.is_recurring && (
            <Badge variant="soft" className="gap-1.5">
              <Repeat size={13} aria-hidden="true" />
              {humanizeRecurrence(event.recurrence_pattern)}
            </Badge>
          )}
          {event.festivals?.id && (
            <LocalizedLink to={`/events?festival=${event.festivals.id}`} className="no-underline">
              <Badge variant="outline" className="gap-1.5">
                <Music size={13} aria-hidden="true" />
                More from {event.festivals.name}
              </Badge>
            </LocalizedLink>
          )}
        </div>
      )}

      {hasAccessibility && (
        <section>
          <Eyebrow as="div" className="mb-2">
            Accessibility
          </Eyebrow>
          <AmenityDisplay
            accessibility={event.accessibility_attributes}
            accessibilityNotes={event.accessibility_notes}
          />
        </section>
      )}

      {showSource && (
        <div className="flex flex-wrap items-center gap-4 rounded-element bg-muted p-4">
          <p className="text-sm text-muted-foreground">
            {missing.charAt(0).toUpperCase() + missing.slice(1)} not listed yet — check the source for
            the latest info.
          </p>
          <Button size="sm" variant="outline" asChild>
            <a href={sourceUrl!} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} className="mr-1.5" />
              Visit source
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Who's going — counts + people-to-meet                               */
/* ------------------------------------------------------------------ */

export function EventWhoIsGoing({
  event,
  user,
  isPast,
}: {
  event: EventWithRelations;
  user: { id: string } | null;
  isPast: boolean;
}) {
  const going = event.attendee_counts?.going ?? 0;
  const interested = event.attendee_counts?.interested ?? 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-title font-display">Who's going</h2>
        {(going > 0 || interested > 0) && (
          <span className="text-sm text-muted-foreground">
            {going} going · {interested} interested
          </span>
        )}
      </div>

      {going === 0 && interested === 0 && !isPast && (
        <p className="text-sm text-muted-foreground">
          {user ? 'No RSVPs yet. Be the first.' : 'No RSVPs yet — sign in to RSVP and see who else is going.'}
        </p>
      )}

      <PeopleHereRail mode="locals" eventId={event.id} title="People you may know" />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Where — map, venue contact, organizer, safety                       */
/* ------------------------------------------------------------------ */

interface WhereProps {
  event: EventWithRelations;
  venueRef: RefObject<HTMLDivElement>;
  countryId?: string | null;
  onOrganizerClick: (organizer: string) => void;
}

export function EventWhere({ event, venueRef, countryId, onOrganizerClick }: WhereProps) {
  const lat = event.latitude ?? event.venues?.latitude;
  const lng = event.longitude ?? event.venues?.longitude;
  const hasNamedVenue = Boolean(event.venues?.name || event.venue_name);
  const hasMap = hasNamedVenue && typeof lat === 'number' && typeof lng === 'number';
  const org = event.organizer;
  const handles = org?.organizer_handles ?? {};

  const socials: Array<{ label: string; href: string }> = [];
  if (org) {
    const website = org.website || handles.website;
    if (website) socials.push({ label: 'Website', href: website });
    const insta = org.instagram || handles.instagram;
    if (insta) socials.push({ label: 'Instagram', href: `https://instagram.com/${insta.replace(/^@/, '')}` });
    if (handles.telegram) socials.push({ label: 'Telegram', href: `https://t.me/${handles.telegram.replace(/^@/, '')}` });
    if (handles.bluesky) socials.push({ label: 'Bluesky', href: `https://bsky.app/profile/${handles.bluesky.replace(/^@/, '')}` });
    if (org.email) socials.push({ label: 'Email', href: `mailto:${org.email}` });
    if (org.phone) socials.push({ label: 'Call', href: `tel:${org.phone}` });
  }

  const hasOrganizer = Boolean(org || event.organizer_name);

  return (
    <div className="flex flex-col gap-6">
      <Card ref={venueRef}>
        <CardHeader>
          <CardTitle>Where</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasMap && (
            <EntityMap
              center={[Number(lng), Number(lat)]}
              zoom={15}
              height={220}
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
          )}
          {event.venues ? (
            <div className="flex items-start gap-2">
              <MapPin size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{event.venues.name}</p>
                <p className="text-sm text-muted-foreground">
                  {event.venues.address}
                  {event.venues.address ? <br /> : null}
                  {event.venues.city}
                  {event.venues.state ? `, ${event.venues.state}` : ''} {event.venues.country}
                </p>
              </div>
            </div>
          ) : (
            event.venue_name && (
              <div className="flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-sm font-medium">{event.venue_name}</p>
              </div>
            )
          )}
          {event.max_attendees && (
            <div className="flex items-center gap-2">
              <Users size={16} className="shrink-0 text-muted-foreground" />
              <span className="text-sm">Capacity {event.max_attendees}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {hasMap && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Navigation2 size={14} className="mr-1.5" />
                  Directions
                </a>
              </Button>
            )}
            {event.venues?.phone && (
              <Button variant="outline" size="sm" asChild>
                <a href={`tel:${event.venues.phone}`}>
                  <Phone size={14} className="mr-1.5" />
                  Call
                </a>
              </Button>
            )}
            {event.venues && (
              <LocalizedLink to={`/venues/${event.venues.slug || event.venues.id}`}>
                <Button variant="outline" size="sm">
                  View venue
                </Button>
              </LocalizedLink>
            )}
            {event.website && (
              <Button variant="outline" size="sm" asChild>
                <a href={event.website} target="_blank" rel="noopener noreferrer">
                  <Globe size={14} className="mr-1.5" />
                  Website
                </a>
              </Button>
            )}
            <EntitySocialLinks links={event.social_links} size="sm" />
          </div>
        </CardContent>
      </Card>

      {hasOrganizer && (
        <Card>
          <CardHeader>
            <CardTitle>Organizer</CardTitle>
          </CardHeader>
          <CardContent>
            {org ? (
              <>
                <LocalizedLink to={`/venues/${org.slug || org.id}`} className="font-medium hover:underline">
                  {org.name}
                </LocalizedLink>
                {socials.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {socials.map((s) => (
                      <Button key={s.label} variant="outline" size="sm" asChild>
                        <a
                          href={s.href}
                          target={s.href.startsWith('http') ? '_blank' : undefined}
                          rel={s.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                        >
                          {s.label}
                        </a>
                      </Button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => onOrganizerClick(event.organizer_name!)}
                  className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium hover:underline"
                >
                  {event.organizer_name}
                </button>
                {event.organizer_contact && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {event.organizer_contact}
                  </span>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <DestinationSafetyCard countryIds={[countryId]} />

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck size={13} aria-hidden="true" />
        Spotted something off? Use the flag to let us know.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile sticky action bar                                            */
/* ------------------------------------------------------------------ */

export function EventMobileBar({
  event,
  isPast,
  user,
  userAttendance,
  onAddToTrip,
  onAttendanceUpdate,
}: {
  event: EventWithRelations;
  isPast: boolean;
  user: { id: string } | null;
  userAttendance: string | null;
  onAddToTrip: () => void;
  onAttendanceUpdate: (status: 'going' | 'interested' | 'not_going') => void;
}) {
  if (isPast) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[1100] flex items-center gap-2 border-t border-border bg-background/95 p-4 backdrop-blur md:hidden">
      {event.ticket_url ? (
        <Button asChild className="flex-1">
          <a href={event.ticket_url} target="_blank" rel="noopener noreferrer">
            <Ticket size={16} className="mr-2" />
            Get Tickets
          </a>
        </Button>
      ) : user ? (
        <Button
          className="flex-1"
          variant={userAttendance === 'going' ? 'default' : 'outline'}
          onClick={() => onAttendanceUpdate(userAttendance === 'going' ? 'not_going' : 'going')}
        >
          {userAttendance === 'going' && <CircleCheck size={16} className="mr-1.5" />}
          {userAttendance === 'going' ? 'Going' : "I'm going"}
        </Button>
      ) : (
        <Button className="flex-1" onClick={onAddToTrip}>
          <Luggage size={16} className="mr-2" />
          Add to Trip
        </Button>
      )}
      <FavoriteButton itemId={event.id} type="event" size="md" />
    </div>
  );
}
