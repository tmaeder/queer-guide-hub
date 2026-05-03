import { useState } from 'react';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Skeleton from '@mui/material/Skeleton';
import { Search, Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDiscoverableTrips } from '@/hooks/useDiscoverableTrips';
import { PublicTripCard } from '@/components/trips/PublicTripCard';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Public discovery feed for opt-in trips.
 *
 * Shows the most recent 60 public trips, with an optional city
 * substring filter. Trip authors flip `trips.is_public=true` from the
 * sharing dialog (or trip settings) to opt in. Anonymous visitors can
 * browse — RLS already exposes public trips to anon.
 */
export default function TripsDiscoverPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { data: trips, isLoading } = useDiscoverableTrips(query);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Compass size={26} style={{ color: 'hsl(var(--brand))' }} />
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          {t('trips.discover.title', 'Discover trips')}
        </Typography>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 3, fontSize: 14 }}>
        {t(
          'trips.discover.subtitle',
          'Real itineraries from QG travelers — copy ideas, find queer-friendly stops, plan your own.',
        )}
      </Typography>

      <TextField
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('trips.discover.searchPlaceholder', 'Filter by city…')}
        size="small"
        fullWidth
        sx={{ mb: 3, maxWidth: 420 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search size={16} />
            </InputAdornment>
          ),
        }}
      />

      {isLoading && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
            gap: 2,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={260} />
          ))}
        </Box>
      )}

      {!isLoading && trips && trips.length === 0 && (
        <EmptyState
          icon={Compass}
          title={t('trips.discover.emptyTitle', 'No public trips yet')}
          description={
            query
              ? t(
                  'trips.discover.emptyFiltered',
                  'No public trips match that city. Try a different one.',
                )
              : t(
                  'trips.discover.emptyDescription',
                  'Be the first — make any of your trips public from the Share dialog.',
                )
          }
        />
      )}

      {!isLoading && trips && trips.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
            gap: 2,
          }}
        >
          {trips.map((trip) => (
            <PublicTripCard key={trip.id} trip={trip} />
          ))}
        </Box>
      )}
    </Container>
  );
}
