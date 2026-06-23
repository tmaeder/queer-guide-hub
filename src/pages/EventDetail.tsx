import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useTrackView } from '@/hooks/useTrackView';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Luggage, Ticket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { MoreLikeThisByTag } from '@/components/tags/MoreLikeThisByTag';
import { TrendingStrip } from '@/components/discovery/TrendingStrip';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { SendEventDialog } from '@/components/messaging/SendEventDialog';
import { EntityDetailLayout, type EntityDetailTab } from '@/components/entity/EntityDetailLayout';
import { useAuth } from '@/hooks/useAuth';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useMeta } from '@/hooks/useMeta';
import { toast } from '@/hooks/use-toast';
import { upsertEventAttendance } from '@/hooks/usePageFetchers';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { PeopleHereRail } from '@/components/people/PeopleHereRail';
import {
  type EventWithRelations,
  EventHero,
  EventOverview,
  EventSidebar,
  fetchEvent,
  exportEventToCalendar,
  formatEventDate,
} from './EventDetail.parts';

export default function EventDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const [userAttendance, setUserAttendance] = useState<string | null>(null);
  const [showEventTz, setShowEventTz] = useState(true);
  const [addToTripOpen, setAddToTripOpen] = useState(false);
  const [sendEventOpen, setSendEventOpen] = useState(false);
  const venueRef = useRef<HTMLDivElement>(null);
  const { track } = useTrackEvent();

  const {
    data: event,
    isLoading,
    error,
    refetch,
  } = useQuery<EventWithRelations | null>({
    queryKey: ['event-detail', slug, user?.id ?? null],
    enabled: Boolean(slug),
    staleTime: 60_000,
    queryFn: () => fetchEvent(slug!, user?.id),
  });

  const { data: tripStatus } = useEntityTripStatus('event', event?.id);
  useTrackView({
    type: 'event',
    slug: event?.slug,
    title: event?.title,
    city: event?.cities?.name ?? event?.city,
    country: event?.countries?.name ?? event?.country,
  });

  const cityForMeta = event?.cities?.name ?? event?.city ?? null;
  const eventOgImage = event ? resolveEntityImage(event, 'event') : undefined;
  useMeta({
    title: event?.title ?? undefined,
    description: event
      ? (event.description?.slice(0, 160) ??
        `Queer Guide event${cityForMeta ? ` in ${cityForMeta}` : ''}.`)
      : undefined,
    canonicalPath: event ? `/events/${event.slug}` : undefined,
    ogImage: eventOgImage || undefined,
    ogType: 'event',
    jsonLd: event
      ? {
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: event.title,
          startDate: event.start_date,
          endDate: event.end_date ?? undefined,
          eventStatus: 'https://schema.org/EventScheduled',
          location: event.venues
            ? {
                '@type': 'Place',
                name: event.venues.name,
                address: [
                  event.venues.address,
                  event.venues.city,
                  event.venues.country,
                ]
                  .filter(Boolean)
                  .join(', '),
              }
            : cityForMeta
              ? { '@type': 'Place', name: cityForMeta }
              : undefined,
          image: eventOgImage || undefined,
          description: event.description ?? undefined,
        }
      : undefined,
  });

  useEffect(() => {
    if (!user || !event) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setUserAttendance(null);
      return;
    }
    setUserAttendance(event.user_attendance ?? null);
  }, [event, user]);

  useEffect(() => {
    if (event?.id) {
      track({
        eventType: 'page_view',
        entityType: 'event',
        entityId: event.id,
        metadata: { title: event.title },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  useEffect(() => {
    if (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pages.eventDetail.loadFailed', 'Failed to load event details.'),
        variant: 'destructive',
      });
    }
  }, [error, t]);

  const handleAttendanceUpdate = async (status: 'going' | 'interested' | 'not_going') => {
    if (!user || !event) {
      toast({
        title: t('pages.eventDetail.authRequired', 'Authentication required'),
        description: t('pages.eventDetail.signInAttendance', 'Please sign in to update your attendance'),
        variant: 'destructive',
      });
      return;
    }
    try {
      const { error: upsertError } = await upsertEventAttendance({
        event_id: event.id,
        user_id: user.id,
        status,
      });
      if (upsertError) throw upsertError;
      setUserAttendance(status);
      toast({
        title:
          status === 'not_going'
            ? t('pages.eventDetail.rsvpCleared', 'RSVP cleared')
            : t('pages.eventDetail.attendanceUpdated', 'Attendance updated'),
        description:
          status === 'not_going'
            ? t('pages.eventDetail.rsvpClearedDesc', 'You are no longer marked for this event.')
            : `You're now marked as ${status.replace('_', ' ')} for this event`,
      });
      await refetch();
    } catch (e) {
      console.error('Error updating attendance:', e);
      toast({
        title: t('common.error', 'Error'),
        description: t('pages.eventDetail.attendanceFailed', 'Failed to update attendance'),
        variant: 'destructive',
      });
    }
  };

  const handleExportToCalendar = async () => {
    if (!event) return;
    try {
      await exportEventToCalendar(event);
      toast({
        title: t('pages.eventDetail.exportSuccess', 'Calendar export successful'),
        description: t('pages.eventDetail.exportSuccessDesc', 'Event has been exported to your calendar'),
      });
    } catch (e) {
      console.error('Error exporting calendar:', e);
      toast({
        title: t('pages.eventDetail.exportFailed', 'Export failed'),
        description: t('pages.eventDetail.exportFailedDesc', 'Failed to export event to calendar'),
        variant: 'destructive',
      });
    }
  };

  const handleShare = async () => {
    if (!event) return;
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, url: shareUrl });
      } catch {
        /* user cancelled */
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: t('pages.eventDetail.linkCopied', 'Link copied'),
        description: t('pages.eventDetail.linkCopiedDesc', 'Event link copied to clipboard'),
      });
    }
  };

  if (!isLoading && !event && !error) {
    return (
      <div className="container mx-auto py-8 text-center">
        <h2 className="text-2xl font-bold mb-4">Event Not Found</h2>
        <p className="text-muted-foreground mb-6">
          The event you're looking for doesn't exist.
        </p>
        <LocalizedLink to="/events">
          <Button>
            <ArrowLeft size={16} className="mr-2" />
            Back to Events
          </Button>
        </LocalizedLink>
      </div>
    );
  }

  const cityName = event?.cities?.name ?? event?.city ?? null;
  // D10: prefer the city's country when it disagrees with the event's
  // denormalised country. Cities are anchored to coords/population so they
  // win over feed-supplied country strings like "US" on a Salford event.
  const effectiveCountry =
    event?.cities?.country_id &&
    event?.countries?.id &&
    event.cities.country_id !== event.countries.id &&
    event.cities.countries
      ? event.cities.countries
      : event?.countries ?? null;
  const countryName = effectiveCountry?.name ?? event?.country ?? null;
  const cityLink = event?.cities?.id ? `/city/${event.cities.slug || event.cities.id}` : null;
  const countryLink = effectiveCountry?.id
    ? `/country/${effectiveCountry.slug || effectiveCountry.id}`
    : null;
  const heroImage = event ? resolveEntityImage('event', event).url : null;
  const locationLabel = event?.venues?.name || event?.venue_name || 'Location TBA';
  const isPast = event ? new Date(event.end_date || event.start_date) < new Date() : false;

  const breadcrumbs = event
    ? [
        { label: t('breadcrumb.events', 'Events'), href: '/events' },
        ...(countryName ? [{ label: countryName, href: countryLink ?? undefined }] : []),
        ...(cityName ? [{ label: cityName, href: cityLink ?? undefined }] : []),
        { label: event.title },
      ]
    : undefined;

  const tabs: EntityDetailTab[] = event
    ? [
        {
          id: 'overview',
          label: 'Overview',
          content: (
            <EventOverview
              event={event}
              user={user}
              isPast={isPast}
              userAttendance={userAttendance}
              onAttendanceUpdate={handleAttendanceUpdate}
              onContentUpdated={refetch}
            />
          ),
        },
      ]
    : [];

  return (
    <>
      <EntityDetailLayout
        loading={isLoading}
        error={(error as Error | null) ?? null}
        breadcrumbs={breadcrumbs}
        hero={
          event ? (
            <EventHero
              event={event}
              cityName={cityName}
              countryName={countryName}
              cityLink={cityLink}
              countryLink={countryLink}
              isPast={isPast}
              showEventTz={showEventTz}
              setShowEventTz={setShowEventTz}
              venueRef={venueRef}
              tripCount={tripStatus?.count}
              isInTrip={tripStatus?.isInTrip}
              onAddToTrip={() => setAddToTripOpen(true)}
              onShare={handleShare}
              onExportToCalendar={handleExportToCalendar}
              onSendEvent={() => setSendEventOpen(true)}
              showSendButton={Boolean(user)}
              heroImage={heroImage}
              locationLabel={locationLabel}
              onContentUpdated={refetch}
            />
          ) : null
        }
        tabs={tabs}
        sidebar={
          event ? (
            <EventSidebar
              event={event}
              venueRef={venueRef}
              countryId={effectiveCountry?.id ?? event.country_id}
              onOrganizerClick={(organizer) =>
                navigate(`/events?organizer=${encodeURIComponent(organizer)}`)
              }
            />
          ) : undefined
        }
        entityType="event"
        entityId={event?.id}
      />

      {event && (
        <>
          <AddToTripDialog
            open={addToTripOpen}
            onClose={() => setAddToTripOpen(false)}
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
          />

          <SendEventDialog
            open={sendEventOpen}
            onOpenChange={setSendEventOpen}
            eventTitle={event.title}
            eventDate={formatEventDate(event.start_date, event.end_date)}
            eventVenue={event.venues?.name}
            eventPath={`/events/${event.slug || event.id}`}
          />

          <div className="container mx-auto px-4 pb-28 md:pb-12">
            {cityName && (
              <TrendingStrip
                city={cityName}
                types={['event']}
                title={`More events in ${cityName}`}
                className="mt-10"
              />
            )}
            <div className="mt-10">
              <PeopleHereRail
                mode="locals"
                eventId={event.id}
                title="Who's going & people to meet"
              />
            </div>
            <SimilarItems entity={{ type: 'event', id: event.id }} className="mt-10" />
            <MoreLikeThisByTag
              entityType="event"
              entityId={event.id}
              title="Related by tag"
              className="mt-10"
            />
          </div>

          {/* Sticky mobile action bar */}
          {!isPast && (
            <div className="fixed inset-x-0 bottom-0 z-[1100] flex items-center gap-2 border-t border-border bg-background/95 p-4 backdrop-blur md:hidden">
              {event.ticket_url ? (
                <Button asChild className="flex-1">
                  <a href={event.ticket_url} target="_blank" rel="noopener noreferrer">
                    <Ticket size={16} className="mr-2" />
                    Get Tickets
                  </a>
                </Button>
              ) : (
                <Button className="flex-1" onClick={() => setAddToTripOpen(true)}>
                  <Luggage size={16} className="mr-2" />
                  Add to Trip
                </Button>
              )}
              <FavoriteButton itemId={event.id} type="event" size="md" />
            </div>
          )}
        </>
      )}
    </>
  );
}
