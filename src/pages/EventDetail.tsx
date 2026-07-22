import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useTrackView } from '@/hooks/useTrackView';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Skeleton } from '@/components/ui/skeleton';
import { GatedDetailFallback } from '@/components/safety/GatedDetailFallback';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { ShareEntityDialog } from '@/components/messaging/ShareEntityDialog';
import { EventMoreEvents } from '@/components/events/EventMoreEvents';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { useAuth } from '@/hooks/useAuth';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useMeta } from '@/hooks/useMeta';
import { socialSameAs } from '@/lib/social/registry';
import { toast } from '@/hooks/use-toast';
import { upsertEventAttendance } from '@/hooks/usePageFetchers';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { MarketplaceForEvent } from '@/components/marketplace/MarketplaceForEvent';
import { MilestonesForEntity } from '@/components/discovery/MilestonesForEntity';
import {
  type EventWithRelations,
  EventHero,
  EventFactStrip,
  EventForYou,
  EventDecisionCard,
  EventAbout,
  EventWhoIsGoing,
  EventWhere,
  EventMobileBar,
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
    image: resolveEntityImage('event', event).url ?? undefined,
    city: event?.cities?.name ?? event?.city,
    country: event?.countries?.name ?? event?.country,
  });

  const cityForMeta = event?.cities?.name ?? event?.city ?? null;
  const eventOgImage = event ? resolveEntityImage('event', event).url : undefined;
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
                address: [event.venues.address, event.venues.city, event.venues.country]
                  .filter(Boolean)
                  .join(', '),
              }
            : cityForMeta
              ? { '@type': 'Place', name: cityForMeta }
              : undefined,
          image: eventOgImage || undefined,
          description: event.description ?? undefined,
          sameAs: socialSameAs(event.social_links).length ? socialSameAs(event.social_links) : undefined,
        }
      : undefined,
  });

  useEffect(() => {
    if (!user || !event) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs RSVP state with fetched data.
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

  const cityName = event?.cities?.name ?? event?.city ?? null;
  // D10: prefer the city's country when it disagrees with the event's
  // denormalised country (cities are coordinate-anchored, so they win).
  const effectiveCountry =
    event?.cities?.country_id &&
    event?.countries?.id &&
    event.cities.country_id !== event.countries.id &&
    event.cities.countries
      ? event.cities.countries
      : (event?.countries ?? null);
  const countryName = effectiveCountry?.name ?? event?.country ?? null;
  const cityLink = event?.cities?.id ? `/city/${event.cities.slug || event.cities.id}` : null;
  const countryLink = effectiveCountry?.id
    ? `/country/${effectiveCountry.slug || effectiveCountry.id}`
    : null;

  useBreadcrumbs(
    event
      ? [
          { label: t('breadcrumb.events', 'Events'), href: '/events' },
          ...(countryName ? [{ label: countryName, href: countryLink ?? undefined }] : []),
          ...(cityName ? [{ label: cityName, href: cityLink ?? undefined }] : []),
          { label: event.title },
        ]
      : null,
  );

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

  // ---- render states -------------------------------------------------

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8" data-testid="event-detail-error">
        <Alert variant="destructive">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{(error as Error).message || 'Something went wrong.'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8" data-testid="event-detail-loading">
        <Skeleton variant="rectangular" height={380} className="mb-6 rounded-container" />
        <Skeleton variant="rectangular" height={28} style={{ width: '50%' }} className="mb-6" />
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[2fr_1fr]">
          <Skeleton variant="rectangular" height={320} className="rounded-container" />
          <Skeleton variant="rectangular" height={280} className="rounded-container" />
        </div>
      </div>
    );
  }

  if (!event) {
    const eventNotFound = (
      <div className="container mx-auto px-4 py-8 text-center">
        <h2 className="mb-4 text-2xl font-bold">Event Not Found</h2>
        <p className="mb-6 text-muted-foreground">The event you're looking for doesn't exist.</p>
        <LocalizedLink to="/events">
          <Button>
            <ArrowLeft size={16} className="mr-2" />
            Back to Events
          </Button>
        </LocalizedLink>
      </div>
    );
    return <GatedDetailFallback entityType="event" slug={slug} notFound={eventNotFound} />;
  }

  const heroImage = resolveEntityImage('event', event).url;
  const isPast = new Date(event.end_date || event.start_date) < new Date();

  const decisionCard = (
    <EventDecisionCard
      event={event}
      user={user}
      isPast={isPast}
      userAttendance={userAttendance}
      onAttendanceUpdate={handleAttendanceUpdate}
      onAddToTrip={() => setAddToTripOpen(true)}
      onExportToCalendar={handleExportToCalendar}
      onSendEvent={() => setSendEventOpen(true)}
    />
  );

  return (
    <>
      <div className="container mx-auto px-4 py-8" data-testid="event-detail-layout">
        {/* Per-section guards: one bad field degrades a module, never the route. */}
        <ErrorBoundary
          section="event-hero"
          fallback={<h1 className="text-display font-display font-bold">{event.title}</h1>}
        >
          <EventHero
            event={event}
            cityName={cityName}
            countryName={countryName}
            cityLink={cityLink}
            countryLink={countryLink}
            heroImage={heroImage}
            onContentUpdated={refetch}
          />
        </ErrorBoundary>

        <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-[2fr_1fr]">
          {/* Main column */}
          <div className="flex flex-col gap-8">
            <ErrorBoundary section="event-fact-strip" fallback={null}>
              <EventFactStrip event={event} showEventTz={showEventTz} setShowEventTz={setShowEventTz} />
            </ErrorBoundary>
            <ErrorBoundary section="event-for-you" fallback={null}>
              <EventForYou event={event} isInTrip={tripStatus?.isInTrip} tripCount={tripStatus?.count} />
            </ErrorBoundary>

            {/* Decision card inline on mobile (rail hides it on md+) */}
            <div className="md:hidden">
              <ErrorBoundary section="event-decision-card" fallback={null}>
                {decisionCard}
              </ErrorBoundary>
            </div>

            <ErrorBoundary section="event-about" fallback={null}>
              <EventAbout event={event} onContentUpdated={refetch} />
            </ErrorBoundary>
            <ErrorBoundary section="event-where" fallback={null}>
              <EventWhere
                event={event}
                venueRef={venueRef}
                countryId={effectiveCountry?.id ?? event.country_id}
                onOrganizerClick={(organizer) =>
                  navigate(`/events?organizer=${encodeURIComponent(organizer)}`)
                }
              />
            </ErrorBoundary>
          </div>

          {/* Sticky decision rail (desktop) */}
          <div className="hidden md:block">
            <ErrorBoundary section="event-decision-card" fallback={null}>
              {decisionCard}
            </ErrorBoundary>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-12 pb-28 md:pb-12">
          <ErrorBoundary section="event-milestones" fallback={null}>
            <MilestonesForEntity entityType="event" entityId={event.id} />
          </ErrorBoundary>
          <ErrorBoundary section="event-who-is-going" fallback={null}>
            <EventWhoIsGoing event={event} user={user} isPast={isPast} />
          </ErrorBoundary>
          <ErrorBoundary section="event-marketplace" fallback={null}>
            <MarketplaceForEvent eventType={event.event_type} eventTitle={event.title} />
          </ErrorBoundary>
          <ErrorBoundary section="event-more-events" fallback={null}>
            <EventMoreEvents eventId={event.id} city={cityName} />
          </ErrorBoundary>
        </div>
      </div>

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

      <ShareEntityDialog
        open={sendEventOpen}
        onOpenChange={setSendEventOpen}
        entity={{
          entity_table: 'events',
          entity_id: event.id,
          title: event.title,
          subtitle: [formatEventDate(event.start_date, event.end_date), event.venues?.name]
            .filter(Boolean)
            .join(' · '),
          image_url: resolveEntityImage('event', event).url ?? null,
          path: `/events/${event.slug || event.id}`,
          gated: Boolean((event as { safety_gated?: boolean }).safety_gated),
        }}
      />

      <EventMobileBar
        event={event}
        isPast={isPast}
        user={user}
        userAttendance={userAttendance}
        onAddToTrip={() => setAddToTripOpen(true)}
        onAttendanceUpdate={handleAttendanceUpdate}
      />
    </>
  );
}
