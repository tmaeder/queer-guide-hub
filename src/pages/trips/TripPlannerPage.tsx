import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useParams, useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import {
  Shield,
  Wallet,
  Ticket,
  CheckSquare,
  MessageCircle,
  Share2,
  Plus,
  Sparkles,
  MessagesSquare,
  FileText,
  Download,
  Check,
  Lightbulb,
  NotebookPen,
  CalendarRange,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTrip, canEditTrip, type TripWithDetails } from '@/hooks/useTrips';
import { useAuth } from '@/hooks/useAuth';
import { useOfflineTripSync } from '@/hooks/useOfflineTripSync';
import { useTripReservations } from '@/hooks/useTripReservations';
import { cacheTripSnapshot } from '@/utils/offlineTripPack';
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
import { TripAtAGlance } from '@/components/trips/TripAtAGlance';
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
import { ErrorState } from '@/components/ui/EmptyState';
import { classifyTripError } from '@/utils/tripError';
import { ErrorBoundary } from '@/components/ErrorBoundary';
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
  const { data: trip, isLoading, error } = useTrip(tripId);
  const [searchParams] = useSearchParams();
  const [addPlaceDay, setAddPlaceDay] = useState<string | undefined>();
  const [addPlaceOpen, setAddPlaceOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const { data: reservations } = useTripReservations(tripId);
  const { toast } = useToast();
  const { user } = useAuth();
  const canEdit = trip ? canEditTrip(trip, user?.id) : false;
  const { pending: pendingOffline } = useOfflineTripSync();

  const handleSaveOffline = async () => {
    if (!tripId || !trip) return;
    await cacheTripSnapshot(tripId, trip, reservations ?? []);
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
  const hasMappedPlaces = trip?.trip_places.some(
    (place) => place.latitude != null && place.longitude != null,
  );
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
            label: t('trips.backToTrips'),
            onClick: () => navigate('/trips'),
            variant: 'default',
          }}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <TripAtAGlance trip={trip} reservations={reservations ?? []} />

      <div
        className="mb-6 flex flex-wrap items-center justify-end gap-2"
        aria-label={t('trips.workspace.tripActions', 'Trip actions')}
      >
        <Button variant="ghost" size="sm" onClick={handleSaveOffline}>
          {offlineSaved ? (
            <Check size={16} className="mr-1.5" />
          ) : (
            <Download size={16} className="mr-1.5" />
          )}
          {offlineSaved
            ? t('trips.planner.offlineSaved', 'Saved')
            : t('trips.planner.saveOffline', 'Offline')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open(`/trips/${tripId}/booklet`, '_blank')}
        >
          <FileText size={16} className="mr-1.5" />
          {t('trips.planner.booklet', 'Booklet')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShareOpen(true)}>
          <Share2 size={16} className="mr-1.5" />
          {t('trips.share.title')}
        </Button>
      </div>

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
      {section === 'prepare' || section === 'all' ? <TripPreTripBlock trip={trip} /> : null}
      <TripNudgesBanner tripId={trip.id} />

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
          <div
            id="trip-itinerary"
            className="scroll-mt-40 flex items-center justify-between mb-6 gap-4 mt-2"
          >
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
              <div className="flex items-center gap-2">
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
                  {t('trips.itinerary.addPlace')}
                </Button>
              </div>
            )}
          </div>

          {/* === TIMELINE SPINE === */}
          <div
            className={
              hasMappedPlaces
                ? 'grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]'
                : undefined
            }
          >
            <div className="min-w-0">
              <DraggableItinerary
                trip={trip}
                onAddPlace={(dayId) => {
                  setAddPlaceDay(dayId);
                  setAddPlaceOpen(true);
                }}
                readOnly={!canEdit}
              />
            </div>
            {hasMappedPlaces ? (
              <aside className="min-w-0" aria-label={t('trips.map.tripMap', 'Trip map')}>
                <div className="sticky top-[calc(var(--header-pinned-bottom)+7rem)] h-[32rem] overflow-hidden rounded-container bg-surface-container">
                  <TripMap
                    places={trip.trip_places}
                    days={trip.trip_days}
                    startDate={trip.start_date ?? undefined}
                    endDate={trip.end_date ?? undefined}
                  />
                </div>
              </aside>
            ) : null}
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
          <TripBookingAssistant
            tripId={trip.id}
            places={trip.trip_places}
            days={trip.trip_days}
            startDate={trip.start_date ?? undefined}
            endDate={trip.end_date ?? undefined}
          />
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
          <MemoryRecapCard tripId={trip.id} />
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
      <Accordion type="multiple" className="w-full">
        {section === 'plan' || section === 'all' ? (
          <>
            <AccordionItem value="build-days">
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
            <AccordionItem value="suggestions">
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
            <AccordionItem value="ai">
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
            <AccordionItem value="safety">
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
                  tripPlaces={trip.trip_places}
                  tripDays={trip.trip_days}
                  tripId={trip.id}
                />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="reservations">
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
            <AccordionItem value="budget">
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
            <AccordionItem value="documents">
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
            <AccordionItem value="packing">
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
            <AccordionItem value="collaborate">
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
            <AccordionItem value="chat">
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
            <AccordionItem value="journal">
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
