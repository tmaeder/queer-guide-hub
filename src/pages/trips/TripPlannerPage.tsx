import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useParams, useSearchParams } from 'react-router';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import {
  MapPin,
  Shield,
  Wallet,
  Ticket,
  CheckSquare,
  MessageCircle,
  Share2,
  ArrowLeft,
  Plus,
  Sparkles,
  MessagesSquare,
  FileText,
  Download,
  Check,
  MoreHorizontal,
  Lightbulb,
  NotebookPen,
  CalendarRange,
} from '@/components/icons';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useTrip, canEditTrip, type TripWithDetails } from '@/hooks/useTrips';
import { useAuth } from '@/hooks/useAuth';
import { useOfflineTripSync } from '@/hooks/useOfflineTripSync';
import { useReservations } from '@/hooks/useReservations';
import { cacheTripSnapshot, prepareTripOfflineAssets } from '@/utils/offlineTripPack';
import { useToast } from '@/hooks/use-toast';
import { DraggableItinerary } from '@/components/trips/DraggableItinerary';
import { TripMap } from '@/components/trips/TripMapLazy';
import { TripSafetyBriefing } from '@/components/trips/TripSafetyBriefing';
import { TripNudgesBanner } from '@/components/trips/TripNudgesBanner';
import { TripTravelBuddiesCTA } from '@/components/trips/TripTravelBuddiesCTA';
import { MarketplaceForTrip } from '@/components/marketplace/MarketplaceForTrip';
import { AddPlaceDialog } from '@/components/trips/AddPlaceDialog';
import { ImportPlacesDialog } from '@/components/trips/ImportPlacesDialog';
import { ShareTripDialog } from '@/components/trips/ShareTripDialog';
import { TripBookingAssistant } from '@/components/trips/TripBookingAssistant';
import { TripSuggestions } from '@/components/trips/TripSuggestions';
import { TripCoverBand } from '@/components/trips/TripCoverBand';
import { TripProgressRing } from '@/components/trips/TripProgressRing';
import { TripDocExpiryBanner } from '@/components/trips/TripDocExpiryBanner';
import { TripPreTripBlock } from '@/components/trips/TripPreTripBlock';
import { MemoryRecapCard } from '@/components/trips/MemoryRecapCard';
import { PostTripMemoryPrompt } from '@/components/trips/PostTripMemoryPrompt';
import { TripLocalContext } from '@/components/trips/TripLocalContext';
import { getTripPhase } from '@/components/trips/tripPhase';
import {
  getTripWorkspaceSection,
  type TripWorkspaceSection,
} from '@/components/trips/tripWorkspaceSection';
import { TravelBuddiesSection } from '@/components/trips/TravelBuddiesSection';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ErrorState } from '@/components/ui/EmptyState';
import { classifyTripError } from '@/utils/tripError';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { PageContainer } from '@/components/layout/PageContainer';
import { trackTripEvent } from '@/utils/tripTracking';
import { AMBIENT_TRIP_WORKSPACE_ENABLED } from '@/lib/trips/ambientTripFlags';

const BudgetTab = lazy(() =>
  import('@/components/trips/BudgetTab').then((m) => ({ default: m.BudgetTab })),
);
const ReservationsTab = lazy(() =>
  import('@/components/trips/ReservationsTab').then((m) => ({
    default: m.ReservationsTab,
  })),
);
const PackingTab = lazy(() =>
  import('@/components/trips/PackingTab').then((m) => ({
    default: m.PackingTab,
  })),
);
const JournalTab = lazy(() =>
  import('@/components/trips/journal/JournalTab').then((m) => ({
    default: m.JournalTab,
  })),
);
const CollaborationTab = lazy(() =>
  import('@/components/trips/CollaborationTab').then((m) => ({
    default: m.CollaborationTab,
  })),
);
const ItineraryGenerator = lazy(() =>
  import('@/components/trips/ItineraryGenerator').then((m) => ({
    default: m.ItineraryGenerator,
  })),
);
const AiPlanTab = lazy(() =>
  import('@/components/trips/AiPlanTab').then((m) => ({ default: m.AiPlanTab })),
);
const TripChatTab = lazy(() =>
  import('@/components/trips/TripChatTab').then((m) => ({ default: m.TripChatTab })),
);
const DocumentsList = lazy(() =>
  import('@/components/trips/DocumentsList').then((m) => ({ default: m.DocumentsList })),
);

function hasSafetyWarnings(trip: TripWithDetails): boolean {
  return trip.trip_places.some(
    (place) =>
      place.countries &&
      place.countries.equality_score != null &&
      place.countries.equality_score < 50,
  );
}

const SuspenseLoader = () => (
  <div className="flex justify-center my-8">
    <TrackLoader size={24} />
  </div>
);

export default function TripPlannerPage() {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { tripId } = useParams<{ tripId: string }>();
  const { data: trip, isLoading, error, refetch } = useTrip(tripId);
  const [searchParams] = useSearchParams();
  const [addPlaceDay, setAddPlaceDay] = useState<string | undefined>();
  const [addPlaceOpen, setAddPlaceOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [savingOffline, setSavingOffline] = useState(false);
  const { data: reservations } = useReservations({ tripId });
  const { toast } = useToast();
  const { user } = useAuth();
  const canEdit = trip ? canEditTrip(trip, user?.id) : false;
  const { pending: pendingOffline } = useOfflineTripSync();

  const handleSaveOffline = async () => {
    if (!user || !trip || !reservations || savingOffline) return;
    setSavingOffline(true);
    try {
      await import('./TodayModePage');
      await prepareTripOfflineAssets();
      await cacheTripSnapshot(user.id, trip, reservations);
    } catch {
      toast({
        title: t('trips.offline.saveFailed', 'Could not save this trip offline'),
        variant: 'destructive',
      });
      return;
    } finally {
      setSavingOffline(false);
    }
    setOfflineSaved(true);
    toast({
      title: t('trips.planner.savedOffline', 'Saved for offline use'),
      description: t(
        'trips.planner.savedOfflineDescription',
        'Itinerary + reservations available without connectivity in Today mode.',
      ),
    });
    setTimeout(() => setOfflineSaved(false), 2500);
  };

  const safetyAlert = useMemo(() => (trip ? hasSafetyWarnings(trip) : false), [trip]);
  const phase = trip ? getTripPhase(trip) : 'plan';
  const section: TripWorkspaceSection | 'all' = AMBIENT_TRIP_WORKSPACE_ENABLED
    ? getTripWorkspaceSection(searchParams, phase)
    : 'all';

  useEffect(() => {
    if (!trip) return;
    trackTripEvent('trip_workspace_section_view', {
      trip_id: trip.id,
      section,
      phase,
    });
  }, [phase, section, trip]);

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-[220px] rounded-container mb-6" />
        <Skeleton className="h-7 w-60" />
        <Skeleton className="h-[400px] mt-6 rounded-container" />
      </PageContainer>
    );
  }

  if (error || !trip) {
    const kind = classifyTripError(tripId, error, trip) ?? 'load-error';
    return (
      <PageContainer>
        <ErrorState
          title={t(`trips.error.${kind}.title`)}
          description={t(`trips.error.${kind}.description`)}
          primaryAction={{
            label: kind === 'load-error' ? t('common.retry', 'Try again') : t('trips.backToTrips'),
            onClick: () => (kind === 'load-error' ? void refetch() : navigate('/trips')),
            variant: 'default',
          }}
        />
      </PageContainer>
    );
  }

  const dateRange =
    trip.start_date && trip.end_date
      ? `${format(parseISO(trip.start_date), 'MMM d')} – ${format(
          parseISO(trip.end_date),
          'MMM d, yyyy',
        )} · ${t('trips.planner.days', {
          count: differenceInCalendarDays(parseISO(trip.end_date), parseISO(trip.start_date)) + 1,
        })}`
      : trip.start_date
        ? t('trips.card.fromDate', {
            date: format(parseISO(trip.start_date), 'MMM d, yyyy'),
          })
        : null;

  const statusLabel = t(`trips.status.${trip.status}`);
  const overlayBtnStyle: React.CSSProperties = {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.3)',
    color: 'hsl(var(--background))',
  };

  return (
    <PageContainer>
      {/* Back to trips */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/trips')}
        className="mb-4 pl-2 pr-4"
      >
        <ArrowLeft size={16} className="mr-1.5" />
        {t('trips.backToTrips')}
      </Button>

      {/* Cover band */}
      <TripCoverBand
        trip={trip}
        dateRange={dateRange}
        statusLabel={statusLabel}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" style={overlayBtnStyle} className="min-h-11">
                <MoreHorizontal size={16} className="mr-1.5" />
                {t('trips.workspace.actions', 'Trip actions')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!reservations || savingOffline}
                onSelect={() => void handleSaveOffline()}
              >
                {offlineSaved ? <Check size={16} /> : <Download size={16} />}
                {t('trips.planner.saveOfflineAria', 'Save trip for offline use')}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <LocalizedLink to={`/trips/${tripId}?view=booklet`}>
                  <FileText size={16} /> {t('trips.booklet.print', 'Print / Save as PDF')}
                </LocalizedLink>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="rounded-full p-1.5"
                style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
              >
                <TripProgressRing trip={trip} size={68} />
              </div>
            </TooltipTrigger>
            <TooltipContent>{t('trips.planner.progressTooltip')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TripCoverBand>

      {pendingOffline > 0 && (
        <div
          className="flex items-center gap-2 rounded-element px-4 py-2 mb-4 text-sm text-muted-foreground bg-surface-container"
          data-testid="offline-pending-banner"
        >
          <TrackLoader size={14} />
          {t('trips.offline.pending', '{{count}} changes waiting to sync', {
            count: pendingOffline,
          })}
        </div>
      )}

      {/* Cross-section alerts stay visible; detailed readiness belongs to Prepare. */}
      <TripDocExpiryBanner trip={trip} />

      <TripNudgesBanner tripId={trip.id} />

      {(section === 'together' || section === 'all') && (
        <section className="mb-6 flex flex-wrap items-center gap-4">
          <Button onClick={() => setShareOpen(true)}>
            <Share2 size={16} /> {t('trips.share.managePeople', 'Invite or share')}
          </Button>
          <Button variant="outline" asChild>
            <LocalizedLink to="/trips/invitations">
              {t('trips.invitations.title', 'Trip invitations')}
            </LocalizedLink>
          </Button>
        </section>
      )}

      {section === 'together' || section === 'all' ? (
        <TripTravelBuddiesCTA
          tripId={trip.id}
          cityId={trip.primary_city_id}
          cityName={trip.primary_city_name}
          endDate={trip.end_date}
        />
      ) : null}

      {section === 'plan' || section === 'all' ? (
        <>
          <div className="flex flex-wrap items-center justify-between mb-6 gap-4 mt-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-background/60 px-4 py-1 text-xs2 font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground" aria-hidden="true" />
              {t('trips.planner.placesCount', { count: trip.trip_places.length })}
              {trip.trip_days.length > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  {t('trips.planner.daysPlanned', { count: trip.trip_days.length })}
                </>
              )}
            </span>
            {canEdit && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImportOpen(true)}
                  className="rounded-full"
                >
                  <Download size={14} className="mr-1.5" />
                  {t('trips.import.button', 'Import')}
                </Button>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => {
                    setAddPlaceDay(undefined);
                    setAddPlaceOpen(true);
                  }}
                  className="rounded-full"
                >
                  <Plus size={16} className="mr-1.5" />
                  {t('trips.itinerary.addStop', 'Add stop')}
                </Button>
              </div>
            )}
          </div>

          {/* === TIMELINE SPINE === */}
          <div className="flex gap-6">
            <div className="flex-1 min-w-0">
              <DraggableItinerary
                trip={trip}
                onAddPlace={(dayId) => {
                  setAddPlaceDay(dayId);
                  setAddPlaceOpen(true);
                }}
                readOnly={!canEdit}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4">
            <LocalizedLink
              to={`/trips/${trip.id}?view=plan&section=prepare&tool=safety`}
              className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4"
            >
              <Shield size={16} aria-hidden /> {t('trips.tabs.safety')}
            </LocalizedLink>
            <LocalizedLink
              to={`/trips/${trip.id}?view=plan&section=prepare&tool=booking`}
              className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4"
            >
              <Ticket size={16} aria-hidden />{' '}
              {t('trips.bookingAssistant.wizardTitle', 'Trip bookings')}
            </LocalizedLink>
            {canEdit && (
              <LocalizedLink
                to={`/trips/${trip.id}?view=plan&section=prepare&tool=confirmation`}
                className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4"
              >
                {t('trips.inbox.importConfirmation', 'Import a booking confirmation')}
              </LocalizedLink>
            )}
          </div>

          {phase !== 'memory' && (
            <div className="mt-6">
              <TripLocalContext trip={trip} />
            </div>
          )}
        </>
      ) : null}

      {section === 'prepare' || section === 'all' ? (
        <div className="mb-8">
          <div id="trip-tool-confirmation" className="scroll-mt-40">
            <TripPreTripBlock trip={trip} />
          </div>
          <section
            id="trip-tool-booking"
            className="scroll-mt-40"
            aria-labelledby="trip-booking-title"
          >
            <h2 id="trip-booking-title" className="mb-4 text-title font-bold">
              {t('trips.bookingAssistant.wizardTitle', 'Trip bookings')}
            </h2>
            <TripBookingAssistant
              key={`${trip.id}:${searchParams.get('tool') === 'booking'}`}
              tripId={trip.id}
              places={trip.trip_places}
              primaryCityId={trip.primary_city_id}
              canEdit={canEdit}
              startInBooking={searchParams.get('tool') === 'booking'}
              adults={trip.adult_count ?? undefined}
              startDate={trip.start_date ?? undefined}
              endDate={trip.end_date ?? undefined}
            />
          </section>
        </div>
      ) : null}

      <TripWorkspaceTools
        section={section}
        trip={trip}
        canEdit={canEdit}
        safetyAlert={safetyAlert}
      />

      {/* === POST-TRIP MEMORY === */}
      {(section === 'together' || section === 'all') && phase === 'memory' && (
        <div className="mt-8 space-y-4">
          <MemoryRecapCard tripId={trip.id} canGenerate={canEdit} />
          <PostTripMemoryPrompt trip={trip} />
        </div>
      )}

      {/* Travel buddies — people heading to this trip's city around these dates.
          Suppressed for criminalizing/death-penalty destinations (outing safety). */}
      {section === 'together' || section === 'all' ? <TravelBuddiesSection trip={trip} /> : null}

      <AddPlaceDialog
        open={addPlaceOpen}
        onClose={() => setAddPlaceOpen(false)}
        tripId={trip.id}
        days={trip.trip_days}
        places={trip.trip_places}
        preselectedDayId={addPlaceDay}
      />

      <ImportPlacesDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        tripId={trip.id}
        nextSortOrder={trip.trip_places.length}
      />

      <ShareTripDialog open={shareOpen} onClose={() => setShareOpen(false)} tripId={trip.id} />
    </PageContainer>
  );
}

function TripWorkspaceTools({
  section,
  trip,
  canEdit,
  safetyAlert,
}: {
  section: TripWorkspaceSection | 'all';
  trip: TripWithDetails;
  canEdit: boolean;
  safetyAlert: boolean;
}) {
  const { t } = useTranslation();
  const [search] = useSearchParams();
  const tool = search.get('tool');
  useEffect(() => {
    if (!tool) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`trip-tool-${tool}`)?.scrollIntoView?.({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [tool, section]);
  const heading =
    section === 'all'
      ? t('trips.timeline.more', 'More tools')
      : section === 'plan'
        ? t('trips.workspace.planTools', 'Shape the itinerary')
        : section === 'prepare'
          ? t('trips.workspace.prepareTools', 'Get ready to go')
          : t('trips.workspace.togetherTools', 'Plan it together');

  return (
    <section className="mt-10" aria-labelledby={`trip-${section}-tools`}>
      <h2 id={`trip-${section}-tools`} className="mb-4 text-title font-bold">
        {heading}
      </h2>
      <Accordion
        key={`${section}:${tool}`}
        type="multiple"
        defaultValue={tool ? [tool] : []}
        className="w-full"
      >
        {section === 'plan' || section === 'all' ? (
          <>
            <AccordionItem value="build-days" id="trip-tool-build-days" className="scroll-mt-40">
              <AccordionTrigger>
                <span className="inline-flex items-center gap-2">
                  <CalendarRange size={16} /> {t('trips.tabs.buildDays', 'Build the days')}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={<SuspenseLoader />}>
                  <ItineraryGenerator trip={trip} canEdit={canEdit} />
                </Suspense>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="suggestions" id="trip-tool-suggestions" className="scroll-mt-40">
              <AccordionTrigger>
                <span className="inline-flex items-center gap-2">
                  <Lightbulb size={16} /> {t('trips.tabs.suggestions', 'Suggestions')}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <TripSuggestions
                  tripId={trip.id}
                  places={trip.trip_places}
                  days={trip.trip_days}
                  startDate={trip.start_date ?? undefined}
                  endDate={trip.end_date ?? undefined}
                />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="map" id="trip-tool-map" className="scroll-mt-40">
              <AccordionTrigger>
                <span className="inline-flex items-center gap-2">
                  <MapPin size={16} /> {t('trips.tabs.map')}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="h-[400px] md:h-[560px]">
                  <TripMap
                    places={trip.trip_places}
                    days={trip.trip_days}
                    startDate={trip.start_date ?? undefined}
                    endDate={trip.end_date ?? undefined}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="ai" id="trip-tool-ai" className="scroll-mt-40">
              <AccordionTrigger>
                <span className="inline-flex items-center gap-2">
                  <Sparkles size={16} /> {t('trips.tabs.ai', 'AI plan')}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={<SuspenseLoader />}>
                  <AiPlanTab trip={trip} />
                </Suspense>
              </AccordionContent>
            </AccordionItem>
          </>
        ) : null}

        {section === 'prepare' || section === 'all' ? (
          <>
            <AccordionItem value="safety" id="trip-tool-safety" className="scroll-mt-40">
              <AccordionTrigger>
                <span className="inline-flex items-center gap-2">
                  <span className="relative inline-flex" aria-hidden={!safetyAlert}>
                    <Shield size={16} />
                    {safetyAlert ? (
                      <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-foreground" />
                    ) : null}
                  </span>
                  {t('trips.tabs.safety')}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <TripSafetyBriefing
                  primaryCountryId={trip.primary_country_id}
                  tripPlaces={trip.trip_places}
                  tripDays={trip.trip_days}
                  tripId={trip.id}
                  canGenerate={canEdit}
                />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem
              value="reservations"
              id="trip-tool-reservations"
              className="scroll-mt-40"
            >
              <AccordionTrigger>
                <span className="inline-flex items-center gap-2">
                  <Ticket size={16} /> {t('trips.tabs.reservations')}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={<SuspenseLoader />}>
                  <ReservationsTab tripId={trip.id} />
                </Suspense>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="budget" id="trip-tool-budget" className="scroll-mt-40">
              <AccordionTrigger>
                <span className="inline-flex items-center gap-2">
                  <Wallet size={16} /> {t('trips.tabs.budget')}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={<SuspenseLoader />}>
                  <BudgetTab
                    tripId={trip.id}
                    members={trip.trip_members}
                    defaultCurrency={trip.currency}
                  />
                </Suspense>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="documents" id="trip-tool-documents" className="scroll-mt-40">
              <AccordionTrigger>
                <span className="inline-flex items-center gap-2">
                  <FileText size={16} /> {t('trips.tabs.documents', 'Documents')}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={<SuspenseLoader />}>
                  <DocumentsList tripId={trip.id} />
                </Suspense>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="packing" id="trip-tool-packing" className="scroll-mt-40">
              <AccordionTrigger>
                <span className="inline-flex items-center gap-2">
                  <CheckSquare size={16} /> {t('trips.tabs.packing')}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ErrorBoundary section="packing">
                  <Suspense fallback={<SuspenseLoader />}>
                    <PackingTab tripId={trip.id} />
                  </Suspense>
                </ErrorBoundary>
                <ErrorBoundary section="trip-gear" fallback={null}>
                  <MarketplaceForTrip cityName={trip.primary_city_name} places={trip.trip_places} />
                </ErrorBoundary>
              </AccordionContent>
            </AccordionItem>
          </>
        ) : null}

        {section === 'together' || section === 'all' ? (
          <>
            <AccordionItem value="collaborate" id="trip-tool-collaborate" className="scroll-mt-40">
              <AccordionTrigger>
                <span className="inline-flex items-center gap-2">
                  <MessageCircle size={16} /> {t('trips.tabs.collaborate')}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={<SuspenseLoader />}>
                  <CollaborationTab tripId={trip.id} />
                </Suspense>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="chat" id="trip-tool-chat" className="scroll-mt-40">
              <AccordionTrigger>
                <span className="inline-flex items-center gap-2">
                  <MessagesSquare size={16} /> {t('trips.tabs.chat', 'Chat')}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={<SuspenseLoader />}>
                  <TripChatTab tripId={trip.id} />
                </Suspense>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="journal" id="trip-tool-journal" className="scroll-mt-40">
              <AccordionTrigger>
                <span className="inline-flex items-center gap-2">
                  <NotebookPen size={16} /> {t('trips.tabs.journal', 'Journal')}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <Suspense fallback={<SuspenseLoader />}>
                  <JournalTab tripId={trip.id} members={trip.trip_members} />
                </Suspense>
              </AccordionContent>
            </AccordionItem>
          </>
        ) : null}
      </Accordion>
    </section>
  );
}
