import { useMemo, useState, lazy, Suspense } from 'react';
import { useParams } from 'react-router';
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
  Hotel,
  Sparkles,
  MessagesSquare,
  FileText,
  Download,
  Check,
  Loader2,
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useTrip, type TripWithDetails } from '@/hooks/useTrips';
import { useTripReservations } from '@/hooks/useTripReservations';
import { cacheTripSnapshot } from '@/utils/offlineTripPack';
import { useToast } from '@/hooks/use-toast';
import { DraggableItinerary } from '@/components/trips/DraggableItinerary';
import { TripMap } from '@/components/trips/TripMap';
import { TripSafetyBriefing } from '@/components/trips/TripSafetyBriefing';
import { TripNudgesBanner } from '@/components/trips/TripNudgesBanner';
import { AddPlaceDialog } from '@/components/trips/AddPlaceDialog';
import { ShareTripDialog } from '@/components/trips/ShareTripDialog';
import { TripBookingAssistant } from '@/components/trips/TripBookingAssistant';
import { TripCoverBand } from '@/components/trips/TripCoverBand';
import { TripProgressRing } from '@/components/trips/TripProgressRing';
import { TripDocExpiryBanner } from '@/components/trips/TripDocExpiryBanner';
import { TripPreTripBlock } from '@/components/trips/TripPreTripBlock';
import { MemoryRecapCard } from '@/components/trips/MemoryRecapCard';
import { PostTripMemoryPrompt } from '@/components/trips/PostTripMemoryPrompt';
import { TripLocalContext } from '@/components/trips/TripLocalContext';
import { getTripPhase } from '@/components/trips/tripPhase';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ErrorState } from '@/components/ui/EmptyState';
import { classifyTripError } from '@/utils/tripError';
import { ErrorBoundary } from '@/components/ErrorBoundary';

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
const CollaborationTab = lazy(() =>
  import('@/components/trips/CollaborationTab').then((m) => ({
    default: m.CollaborationTab,
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
    <Loader2 className="h-6 w-6 animate-spin" />
  </div>
);

export default function TripPlannerPage() {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { tripId } = useParams<{ tripId: string }>();
  const { data: trip, isLoading, error } = useTrip(tripId);
  const [addPlaceDay, setAddPlaceDay] = useState<string | undefined>();
  const [addPlaceOpen, setAddPlaceOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [mobileBookingOpen, setMobileBookingOpen] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const { data: reservations } = useTripReservations(tripId);
  const { toast } = useToast();

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

  const safetyAlert = useMemo(
    () => (trip ? hasSafetyWarnings(trip) : false),
    [trip],
  );

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 md:py-10">
        <Skeleton className="h-[220px] rounded-container mb-6" />
        <Skeleton className="h-7 w-60" />
        <Skeleton className="h-[400px] mt-6 rounded-container" />
      </div>
    );
  }

  if (error || !trip) {
    const kind = classifyTripError(tripId, error, trip) ?? 'load-error';
    return (
      <div className="container mx-auto py-8 md:py-16">
        <ErrorState
          title={t(`trips.error.${kind}.title`)}
          description={t(`trips.error.${kind}.description`)}
          primaryAction={{
            label: t('trips.backToTrips'),
            onClick: () => navigate('/trips'),
            variant: 'default',
          }}
        />
      </div>
    );
  }

  const dateRange =
    trip.start_date && trip.end_date
      ? `${format(new Date(trip.start_date), 'MMM d')} – ${format(
          new Date(trip.end_date),
          'MMM d, yyyy',
        )} · ${t('trips.planner.days', {
          count: differenceInDays(new Date(trip.end_date), new Date(trip.start_date)) + 1,
        })}`
      : trip.start_date
        ? t('trips.card.fromDate', {
            date: format(new Date(trip.start_date), 'MMM d, yyyy'),
          })
        : null;

  const statusLabel = t(`trips.status.${trip.status}`);
  const phase = getTripPhase(trip);

  const overlayBtnStyle: React.CSSProperties = {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.3)',
    color: 'hsl(var(--background))',
  };

  return (
    <div className="container mx-auto py-5 md:py-8">
      {/* Back to trips */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/trips')}
        className="mb-3 pl-2 pr-3"
      >
        <ArrowLeft style={{ width: 16, height: 16, marginRight: 6 }} />
        {t('trips.backToTrips')}
      </Button>

      {/* Cover band (sticky-ish header at top of spine) */}
      <TripCoverBand
        trip={trip}
        dateRange={dateRange}
        statusLabel={statusLabel}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveOffline}
              disabled={!trip}
              style={overlayBtnStyle}
              aria-label={t('trips.planner.saveOfflineAria', 'Save trip for offline use')}
            >
              {offlineSaved ? (
                <Check style={{ width: 16, height: 16, marginRight: 6 }} />
              ) : (
                <Download style={{ width: 16, height: 16, marginRight: 6 }} />
              )}
              {offlineSaved
                ? t('trips.planner.offlineSaved', 'Saved')
                : t('trips.planner.saveOffline', 'Offline')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/trips/${tripId}/booklet`, '_blank')}
              disabled={!trip}
              style={overlayBtnStyle}
              aria-label={t('trips.planner.bookletAria', 'Download trip booklet (PDF)')}
            >
              <FileText style={{ width: 16, height: 16, marginRight: 6 }} />
              {t('trips.planner.booklet', 'Booklet')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareOpen(true)}
              style={overlayBtnStyle}
            >
              <Share2 style={{ width: 16, height: 16, marginRight: 6 }} />
              {t('trips.share.title')}
            </Button>
          </div>
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

      {/* Pre-trip block: docs, countdown + gaps */}
      <TripDocExpiryBanner trip={trip} />
      <TripPreTripBlock trip={trip} />
      <TripNudgesBanner tripId={trip.id} />

      {/* Quick action row */}
      <div className="flex items-center justify-between mb-5 gap-3 mt-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-foreground" aria-hidden="true" />
          {t('trips.planner.placesCount', { count: trip.trip_places.length })}
          {trip.trip_days.length > 0 && (
            <>
              <span className="opacity-40">·</span>
              {t('trips.planner.daysPlanned', { count: trip.trip_days.length })}
            </>
          )}
        </span>
        <Button
          variant="brand"
          size="sm"
          onClick={() => {
            setAddPlaceDay(undefined);
            setAddPlaceOpen(true);
          }}
          className="rounded-full"
        >
          <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
          {t('trips.itinerary.addPlace')}
        </Button>
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
          />
        </div>
        <aside className="hidden lg:block w-72 flex-shrink-0">
          <TripBookingAssistant
            tripId={trip.id}
            places={trip.trip_places}
            days={trip.trip_days}
            startDate={trip.start_date ?? undefined}
            endDate={trip.end_date ?? undefined}
          />
        </aside>
      </div>

      {/* Mobile booking FAB + sheet */}
      <div className="block lg:hidden fixed bottom-20 right-4 z-[1200]">
        <Button
          size="sm"
          onClick={() => setMobileBookingOpen(true)}
          style={{ borderRadius: '50%', width: 48, height: 48, padding: 0 }}
        >
          <Hotel style={{ width: 20, height: 20 }} />
        </Button>
      </div>
      <Sheet open={mobileBookingOpen} onOpenChange={setMobileBookingOpen}>
        <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl p-4">
          <div className="w-10 h-1 bg-border rounded mx-auto mb-4" />
          <TripBookingAssistant
            tripId={trip.id}
            places={trip.trip_places}
            days={trip.trip_days}
            startDate={trip.start_date ?? undefined}
            endDate={trip.end_date ?? undefined}
          />
        </SheetContent>
      </Sheet>

      {phase !== 'memory' && (
        <div className="mt-6">
          <TripLocalContext trip={trip} />
        </div>
      )}

      {/* === MORE PANEL (secondary tools) === */}
      <section className="mt-8 border-t border-border pt-6" aria-label={t('trips.timeline.more', 'More tools')}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">
          {t('trips.timeline.more', 'More tools')}
        </h2>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="map">
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

          <AccordionItem value="safety">
            <AccordionTrigger>
              <span className="inline-flex items-center gap-2">
                <span className="relative inline-flex" aria-hidden={!safetyAlert}>
                  <Shield size={16} />
                  {safetyAlert && (
                    <span
                      className="absolute rounded-full border-2 border-background"
                      style={{
                        top: -3,
                        right: -4,
                        width: 8,
                        height: 8,
                        backgroundColor: 'hsl(var(--warning, 38 92% 50%))',
                      }}
                    />
                  )}
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
            </AccordionContent>
          </AccordionItem>

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
        </Accordion>
      </section>

      {/* === POST-TRIP MEMORY === */}
      {phase === 'memory' && (
        <div className="mt-8">
          <MemoryRecapCard tripId={trip.id} />
        </div>
      )}

      <AddPlaceDialog
        open={addPlaceOpen}
        onClose={() => setAddPlaceOpen(false)}
        tripId={trip.id}
        days={trip.trip_days}
        preselectedDayId={addPlaceDay}
      />

      <ShareTripDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        tripId={trip.id}
      />
    </div>
  );
}
