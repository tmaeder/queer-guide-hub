import { useMemo, useState } from 'react';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { Plus, Map } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTrips } from '@/hooks/useTrips';
import { useAuth } from '@/hooks/useAuth';
import { TripCard } from '@/components/trips/TripCard';
import { CreateTripDialog } from '@/components/trips/CreateTripDialog';
import { TripsSignedOutHero } from '@/components/trips/TripsSignedOutHero';
import { TripTemplates } from '@/components/trips/TripTemplates';
import {
  TripsToolbar,
  type TripSortKey,
  type TripStatusFilter,
} from '@/components/trips/TripsToolbar';
import {
  countTripsByStatus,
  filterAndSortTrips,
} from '@/components/trips/tripsFilters';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';

export default function TripsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: trips, isLoading, error, refetch } = useTrips();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TripStatusFilter>('all');
  const [sortKey, setSortKey] = useState<TripSortKey>('recent');

  const counts = useMemo(() => countTripsByStatus(trips ?? []), [trips]);

  const visibleTrips = useMemo(
    () => filterAndSortTrips(trips ?? [], search, statusFilter, sortKey),
    [trips, search, statusFilter, sortKey],
  );

  if (!user) {
    return <TripsSignedOutHero />;
  }

  const hasAnyTrips = (trips?.length ?? 0) > 0;
  const isFiltered = search.trim() !== '' || statusFilter !== 'all';

  return (
    <Container sx={{ py: { xs: 4, md: 6 } }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          mb: 4,
        }}
      >
        <Box>
          <Typography
            variant="h3"
            sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, mb: 0.5 }}
          >
            {t('trips.title')}
            {hasAnyTrips && (
              <Box
                component="span"
                sx={{
                  ml: 1.25,
                  color: 'text.secondary',
                  fontSize: '0.65em',
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                · {trips?.length}
              </Box>
            )}
          </Typography>
          <Typography color="text.secondary">{t('trips.subtitle')}</Typography>
        </Box>
        <Button
          variant="brand"
          size="lg"
          onClick={() => setCreateOpen(true)}
          style={{ paddingLeft: 20, paddingRight: 20 }}
        >
          <Plus style={{ width: 18, height: 18, marginRight: 6 }} />
          {t('trips.create')}
        </Button>
      </Box>

      {/* Toolbar — hide while loading or completely empty */}
      {hasAnyTrips && (
        <TripsToolbar
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sortKey={sortKey}
          onSortChange={setSortKey}
          counts={counts}
        />
      )}

      {/* Loading */}
      {isLoading && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(3, 1fr)',
            },
            gap: 2,
          }}
        >
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              variant="rounded"
              height={240}
              sx={{ borderRadius: 2 }}
            />
          ))}
        </Box>
      )}

      {/* Error */}
      {error && !isLoading && (
        <ErrorState
          message={t('trips.error')}
          onRetry={() => {
            void refetch();
          }}
        />
      )}

      {/* Empty — no trips at all */}
      {!isLoading && !error && !hasAnyTrips && (
        <Box sx={{ mt: 2 }}>
          <EmptyState
            icon={Map}
            title={t('trips.empty.title')}
            description={t('trips.empty.description')}
            mood="encouraging"
            primaryAction={{
              label: t('trips.empty.cta'),
              onClick: () => setCreateOpen(true),
              variant: 'brand',
            }}
          />
          <TripTemplates />
        </Box>
      )}

      {/* Filtered empty — user has trips but the filter hides them */}
      {!isLoading &&
        !error &&
        hasAnyTrips &&
        visibleTrips.length === 0 && (
          <EmptyState
            icon={Map}
            title={t('trips.filteredEmpty.title')}
            description={t('trips.filteredEmpty.description')}
            primaryAction={{
              label: t('trips.filteredEmpty.cta'),
              onClick: () => {
                setSearch('');
                setStatusFilter('all');
              },
              variant: 'outline',
            }}
          />
        )}

      {/* Populated grid */}
      {!isLoading && !error && visibleTrips.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(3, 1fr)',
            },
            gap: 2,
          }}
        >
          {visibleTrips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </Box>
      )}

      {/* Show templates below grid when user has few trips */}
      {!isLoading && !error && hasAnyTrips && !isFiltered && (
        <Box
          sx={{
            mt: 6,
            pt: 5,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <TripTemplates />
        </Box>
      )}

      <CreateTripDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Container>
  );
}
