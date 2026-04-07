import { useState } from 'react';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { Plus, Map } from 'lucide-react';
import { useTrips } from '@/hooks/useTrips';
import { useAuth } from '@/hooks/useAuth';
import { TripCard } from '@/components/trips/TripCard';
import { CreateTripDialog } from '@/components/trips/CreateTripDialog';

export default function TripsPage() {
  const { user } = useAuth();
  const { data: trips, isLoading, error } = useTrips();
  const [createOpen, setCreateOpen] = useState(false);

  if (!user) {
    return (
      <Container maxWidth="lg" sx={{ py: 10, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom>
          Sign in to plan your trips
        </Typography>
        <Typography color="text.secondary">
          Create itineraries, check LGBTQ+ safety info, and collaborate with travel companions.
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
      <Box className="flex items-center justify-between mb-6">
        <div>
          <Typography variant="h4" fontWeight={700}>
            My Trips
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Plan, organize, and stay safe on your travels.
          </Typography>
        </div>
        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={() => setCreateOpen(true)}
        >
          Create Trip
        </Button>
      </Box>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={220} />
          ))}
        </div>
      )}

      {error && (
        <Typography color="error">Failed to load trips.</Typography>
      )}

      {!isLoading && trips && trips.length === 0 && (
        <Box className="flex flex-col items-center justify-center py-20 text-center">
          <Box
            className="rounded-full bg-primary/10 p-4 mb-4"
            sx={{ width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Map size={32} className="text-primary" />
          </Box>
          <Typography variant="h6" gutterBottom>
            No trips yet
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 400 }}>
            Start planning your next adventure. Add destinations, check safety info, and keep everything organized.
          </Typography>
          <Button
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={() => setCreateOpen(true)}
          >
            Create Your First Trip
          </Button>
        </Box>
      )}

      {!isLoading && trips && trips.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}

      <CreateTripDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Container>
  );
}
