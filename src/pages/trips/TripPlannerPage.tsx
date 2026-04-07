import { useState, lazy, Suspense } from 'react';
import { useParams } from 'react-router';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import AvatarGroup from '@mui/material/AvatarGroup';
import Skeleton from '@mui/material/Skeleton';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import { Calendar, MapPin, Shield, Wallet, Ticket, CheckSquare, MessageCircle, Share2 } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { useTrip } from '@/hooks/useTrips';
import { DraggableItinerary } from '@/components/trips/DraggableItinerary';
import { TripMap } from '@/components/trips/TripMap';
import { TripSafetyBriefing } from '@/components/trips/TripSafetyBriefing';
import { AddPlaceDialog } from '@/components/trips/AddPlaceDialog';
import { ShareTripDialog } from '@/components/trips/ShareTripDialog';
import { TripSuggestions } from '@/components/trips/TripSuggestions';

const BudgetTab = lazy(() => import('@/components/trips/BudgetTab').then(m => ({ default: m.BudgetTab })));
const ReservationsTab = lazy(() => import('@/components/trips/ReservationsTab').then(m => ({ default: m.ReservationsTab })));
const PackingTab = lazy(() => import('@/components/trips/PackingTab').then(m => ({ default: m.PackingTab })));
const CollaborationTab = lazy(() => import('@/components/trips/CollaborationTab').then(m => ({ default: m.CollaborationTab })));

export default function TripPlannerPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { data: trip, isLoading, error } = useTrip(tripId);
  const [tab, setTab] = useState(0);
  const [addPlaceDay, setAddPlaceDay] = useState<string | undefined>();
  const [addPlaceOpen, setAddPlaceOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Skeleton variant="text" width={300} height={40} />
        <Skeleton variant="text" width={200} height={24} sx={{ mt: 1 }} />
        <Skeleton variant="rounded" height={400} sx={{ mt: 4 }} />
      </Container>
    );
  }

  if (error || !trip) {
    return (
      <Container maxWidth="lg" sx={{ py: 10, textAlign: 'center' }}>
        <Typography color="error">
          {error ? 'Failed to load trip.' : 'Trip not found.'}
        </Typography>
      </Container>
    );
  }

  const dateRange =
    trip.start_date && trip.end_date
      ? `${format(new Date(trip.start_date), 'MMM d')} - ${format(new Date(trip.end_date), 'MMM d, yyyy')} (${differenceInDays(new Date(trip.end_date), new Date(trip.start_date))} days)`
      : trip.start_date
        ? `From ${format(new Date(trip.start_date), 'MMM d, yyyy')}`
        : null;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Box className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <Typography variant="h4" fontWeight={700}>
            {trip.title}
          </Typography>
          {dateRange && (
            <Box className="flex items-center gap-1.5 mt-1">
              <Calendar size={15} className="text-muted-foreground" />
              <Typography variant="body2" color="text.secondary">
                {dateRange}
              </Typography>
            </Box>
          )}
          {trip.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {trip.description}
            </Typography>
          )}
        </div>

        {trip.trip_members.length > 0 && (
          <AvatarGroup max={5} sx={{ flexShrink: 0 }}>
            {trip.trip_members.map((m) => (
              <Avatar
                key={m.id}
                alt={m.profiles?.display_name || 'Member'}
                src={m.profiles?.avatar_url || undefined}
                sx={{ width: 32, height: 32 }}
              >
                {(m.profiles?.display_name || 'U')[0].toUpperCase()}
              </Avatar>
            ))}
          </AvatarGroup>
        )}
      </Box>

      <Box className="flex items-center gap-2 mb-3">
        <Chip label={trip.status} size="small" variant="outlined" />
        <IconButton size="small" onClick={() => setShareOpen(true)} title="Share trip">
          <Share2 size={16} />
        </IconButton>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab icon={<Calendar size={16} />} iconPosition="start" label="Itinerary" />
          <Tab icon={<MapPin size={16} />} iconPosition="start" label="Map" />
          <Tab icon={<Shield size={16} />} iconPosition="start" label="Safety" />
          <Tab icon={<Wallet size={16} />} iconPosition="start" label="Budget" />
          <Tab icon={<Ticket size={16} />} iconPosition="start" label="Reservations" />
          <Tab icon={<CheckSquare size={16} />} iconPosition="start" label="Packing" />
          <Tab icon={<MessageCircle size={16} />} iconPosition="start" label="Collaborate" />
        </Tabs>
      </Box>

      {tab === 0 && (
        <Box className="flex gap-4">
          <Box className="flex-1 min-w-0">
            <DraggableItinerary
              trip={trip}
              onAddPlace={(dayId) => { setAddPlaceDay(dayId); setAddPlaceOpen(true); }}
            />
          </Box>
          <Box className="hidden lg:block w-72 flex-shrink-0">
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
          <BudgetTab tripId={trip.id} members={trip.trip_members} defaultCurrency={trip.currency} />
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
