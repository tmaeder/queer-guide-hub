import { useMemo, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Skeleton from '@mui/material/Skeleton';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import {
  Calendar,
  MapPin,
  Shield,
  Wallet,
  Ticket,
  CheckSquare,
  MessageCircle,
  Share2,
  ArrowLeft,
  Plus,
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useTrip, type TripWithDetails } from '@/hooks/useTrips';
import { DraggableItinerary } from '@/components/trips/DraggableItinerary';
import { TripMap } from '@/components/trips/TripMap';
import { TripSafetyBriefing } from '@/components/trips/TripSafetyBriefing';
import { AddPlaceDialog } from '@/components/trips/AddPlaceDialog';
import { ShareTripDialog } from '@/components/trips/ShareTripDialog';
import { TripSuggestions } from '@/components/trips/TripSuggestions';
import { TripCoverBand } from '@/components/trips/TripCoverBand';
import { TripProgressRing } from '@/components/trips/TripProgressRing';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/EmptyState';

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

/**
 * Does the trip have any place whose country has a low LGBTQ+ equality
 * score? Triggers the amber dot on the Safety tab so users can see at a
 * glance that the briefing is worth reading.
 */
function hasSafetyWarnings(trip: TripWithDetails): boolean {
  return trip.trip_places.some(
    (place) =>
      place.countries &&
      place.countries.equality_score != null &&
      place.countries.equality_score < 50,
  );
}

export default function TripPlannerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tripId } = useParams<{ tripId: string }>();
  const { data: trip, isLoading, error } = useTrip(tripId);
  const [tab, setTab] = useState(0);
  const [addPlaceDay, setAddPlaceDay] = useState<string | undefined>();
  const [addPlaceOpen, setAddPlaceOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const safetyAlert = useMemo(
    () => (trip ? hasSafetyWarnings(trip) : false),
    [trip],
  );

  if (isLoading) {
    return (
      <Container sx={{ py: { xs: 3, md: 5 } }}>
        <Skeleton variant="rounded" height={220} sx={{ borderRadius: 3, mb: 3 }} />
        <Skeleton variant="text" width={240} height={28} />
        <Skeleton variant="rounded" height={400} sx={{ mt: 3 }} />
      </Container>
    );
  }

  if (error || !trip) {
    return (
      <Container sx={{ py: { xs: 4, md: 8 } }}>
        <ErrorState
          message={error ? t('trips.planner.loadFailed') : t('trips.planner.notFound')}
          onRetry={() => navigate('/trips')}
        />
      </Container>
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

  return (
    <Container sx={{ py: { xs: 2.5, md: 4 } }}>
      {/* Back to trips */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/trips')}
        style={{ marginBottom: 12, paddingLeft: 8, paddingRight: 12 }}
      >
        <ArrowLeft style={{ width: 16, height: 16, marginRight: 6 }} />
        {t('trips.backToTrips')}
      </Button>

      {/* Cover band with title, status, dates, members, share + progress ring */}
      <TripCoverBand
        trip={trip}
        dateRange={dateRange}
        statusLabel={statusLabel}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShareOpen(true)}
            style={{
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderColor: 'rgba(255,255,255,0.3)',
              color: '#ffffff',
            }}
          >
            <Share2 style={{ width: 16, height: 16, marginRight: 6 }} />
            {t('trips.share')}
          </Button>
        }
      >
        <Tooltip title={t('trips.planner.progressTooltip')} arrow>
          <Box
            sx={{
              bgcolor: 'rgba(255,255,255,0.12)',
              borderRadius: 999,
              p: 0.75,
            }}
          >
            <TripProgressRing trip={trip} size={68} />
          </Box>
        </Tooltip>
      </TripCoverBand>

      {/* Quick action row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
          gap: 1.5,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {t('trips.planner.placesCount', {
            count: trip.trip_places.length,
          })}
          {trip.trip_days.length > 0 && (
            <>
              {' · '}
              {t('trips.planner.daysPlanned', { count: trip.trip_days.length })}
            </>
          )}
        </Typography>
        <Button
          variant="brand"
          size="sm"
          onClick={() => {
            setAddPlaceDay(undefined);
            setAddPlaceOpen(true);
          }}
        >
          <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
          {t('trips.itinerary.addPlace')}
        </Button>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            minHeight: 48,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              minHeight: 48,
              minWidth: { xs: 96, md: 120 },
            },
            '& .MuiTabs-indicator': {
              backgroundColor: 'brand.main',
              height: 3,
              borderRadius: '3px 3px 0 0',
            },
            '& .Mui-selected': { color: 'brand.main !important' },
          }}
        >
          <Tab
            icon={<Calendar size={16} />}
            iconPosition="start"
            label={t('trips.tabs.itinerary')}
          />
          <Tab
            icon={<MapPin size={16} />}
            iconPosition="start"
            label={t('trips.tabs.map')}
          />
          <Tab
            icon={
              <Box
                sx={{ position: 'relative', display: 'inline-flex' }}
                aria-hidden={!safetyAlert}
              >
                <Shield size={16} />
                {safetyAlert && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -3,
                      right: -4,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: 'warning.main',
                      border: 2,
                      borderColor: 'background.paper',
                      borderStyle: 'solid',
                    }}
                  />
                )}
              </Box>
            }
            iconPosition="start"
            label={t('trips.tabs.safety')}
          />
          <Tab
            icon={<Wallet size={16} />}
            iconPosition="start"
            label={t('trips.tabs.budget')}
          />
          <Tab
            icon={<Ticket size={16} />}
            iconPosition="start"
            label={t('trips.tabs.reservations')}
          />
          <Tab
            icon={<CheckSquare size={16} />}
            iconPosition="start"
            label={t('trips.tabs.packing')}
          />
          <Tab
            icon={<MessageCircle size={16} />}
            iconPosition="start"
            label={t('trips.tabs.collaborate')}
          />
        </Tabs>
      </Box>

      {tab === 0 && (
        <Box sx={{ display: 'flex', gap: 3 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <DraggableItinerary
              trip={trip}
              onAddPlace={(dayId) => {
                setAddPlaceDay(dayId);
                setAddPlaceOpen(true);
              }}
            />
          </Box>
          <Box sx={{ display: { xs: 'none', lg: 'block' }, width: 288, flexShrink: 0 }}>
            <TripSuggestions
              tripId={trip.id}
              places={trip.trip_places}
              days={trip.trip_days}
              startDate={trip.start_date ?? undefined}
              endDate={trip.end_date ?? undefined}
            />
          </Box>
        </Box>
      )}

      {tab === 1 && (
        <Box sx={{ height: { xs: 400, md: 560 } }}>
          <TripMap places={trip.trip_places} days={trip.trip_days} />
        </Box>
      )}

      {tab === 2 && <TripSafetyBriefing tripPlaces={trip.trip_places} />}

      {tab === 3 && (
        <Suspense fallback={<CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} />}>
          <BudgetTab
            tripId={trip.id}
            members={trip.trip_members}
            defaultCurrency={trip.currency}
          />
        </Suspense>
      )}

      {tab === 4 && (
        <Suspense fallback={<CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} />}>
          <ReservationsTab tripId={trip.id} />
        </Suspense>
      )}

      {tab === 5 && (
        <Suspense fallback={<CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} />}>
          <PackingTab tripId={trip.id} />
        </Suspense>
      )}

      {tab === 6 && (
        <Suspense fallback={<CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} />}>
          <CollaborationTab tripId={trip.id} />
        </Suspense>
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
    </Container>
  );
}
