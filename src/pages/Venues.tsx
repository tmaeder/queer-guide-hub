import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useMeta } from '@/hooks/useMeta';
import { useAuth } from '@/hooks/useAuth';
import { VenueCard } from '@/components/venues/VenueCard';
import { VenueFilters } from '@/components/venues/VenueFilters';
import { ExploreMap } from '@/components/map/ExploreMap';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState, LoadingTimeout, ErrorState } from '@/components/ui/EmptyState';
import { MapPin, Plus, Grid, Map } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import { useTranslation } from 'react-i18next';

type Venue = Database['public']['Tables']['venues']['Row'];

const Venues = () => {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { _user } = useAuth();
  const { venues, loading, error, hasMore, fetchVenues, loadingTimedOut } = useVenues(false);

  useMeta({
    title: 'Venues',
    description:
      'Discover queer-friendly venues, businesses, and organizations worldwide. Find safe spaces near you.',
    canonicalPath: '/venues',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Queer-Friendly Venues',
      description: 'Discover queer-friendly venues, businesses, and organizations worldwide.',
      url: 'https://queer.guide/venues',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
    },
  });
  const { events } = useEvents();
  const [_selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [currentFilters, setCurrentFilters] = useState<Record<string, unknown>>({});
  const [sortBy, setSortBy] = useState<string>('featured');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [autoLoadedCount, setAutoLoadedCount] = useState(0);

  const handleFiltersChange = async (filters: Record<string, unknown>) => {
    setCurrentFilters(filters);
    setPage(1);
    setAutoLoadedCount(0);
    await fetchVenues(filters, { page: 1, pageSize: PAGE_SIZE, append: false });
  };

  const handleViewDetails = (venue: Venue) => {
    setSelectedVenue(venue);
  };

  const sortedVenues = useMemo(() => {
    if (!venues || venues.length === 0) return [];

    if (sortBy === 'featured') {
      return [...venues].sort((a, b) => {
        const aFeat = a.featured ? 1 : 0;
        const bFeat = b.featured ? 1 : 0;
        if (aFeat !== bFeat) return bFeat - aFeat;
        return (a.name || '').localeCompare(b.name || '');
      });
    }

    return [...venues].sort((a, b) => {
      let aValue: string | Date, bValue: string | Date;
      switch (sortBy) {
        case 'name':
          aValue = a.name?.toLowerCase() || '';
          bValue = b.name?.toLowerCase() || '';
          break;
        case 'category':
          aValue = a.category?.toLowerCase() || '';
          bValue = b.category?.toLowerCase() || '';
          break;
        case 'city':
          aValue = a.city?.toLowerCase() || '';
          bValue = b.city?.toLowerCase() || '';
          break;
        case 'created_at':
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
          break;
        default:
          return 0;
      }
      if (aValue < bValue) return -1;
      if (aValue > bValue) return 1;
      return 0;
    });
  }, [venues, sortBy]);

  // Initial fetch
  useEffect(() => {
    (async () => {
      setPage(1);
      setAutoLoadedCount(0);
      await fetchVenues(currentFilters, { page: 1, pageSize: PAGE_SIZE, append: false });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const observer = new IntersectionObserver(
      async (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !loading && hasMore && autoLoadedCount < 50) {
          const nextPage = page + 1;
          setPage(nextPage);
          const result = await fetchVenues(currentFilters, {
            page: nextPage,
            pageSize: PAGE_SIZE,
            append: true,
          });
          const fetched = result?.fetched ?? PAGE_SIZE;
          setAutoLoadedCount((c) => Math.min(50, c + fetched));
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.unobserve(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, loading, hasMore, currentFilters, autoLoadedCount]);

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Container sx={{ py: { xs: 3, md: 5 } }}>
        {/* Filters (search is the header now) */}
        <VenueFilters onFiltersChange={handleFiltersChange} />

        {/* Toolbar: result count + sort + view toggle + submit */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mt: 2.5,
            mb: 2,
            gap: 1.5,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {!loading && venues.length > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                {venues.length} venue{venues.length !== 1 ? 's' : ''}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger style={{ width: 120, height: 34, fontSize: '0.8rem' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="featured">{t('pages.venues.sortFeatured', 'Featured')}</SelectItem>
                <SelectItem value="name">{t('pages.venues.sortName', 'Name')}</SelectItem>
                <SelectItem value="category">{t('pages.venues.sortCategory', 'Category')}</SelectItem>
                <SelectItem value="city">{t('pages.venues.sortCity', 'City')}</SelectItem>
                <SelectItem value="created_at">{t('pages.venues.sortNewest', 'Newest')}</SelectItem>
              </SelectContent>
            </Select>

            <Box sx={{ display: 'flex', borderRadius: 1.5, overflow: 'hidden' }}>
              <IconButton
                size="small"
                onClick={() => setViewMode('grid')}
                sx={{
                  borderRadius: 0,
                  bgcolor: viewMode === 'grid' ? 'action.selected' : 'transparent',
                  px: 1,
                }}
                aria-label={t('pages.venues.gridView', 'Grid view')}
              >
                <Grid style={{ width: 16, height: 16 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => setViewMode('map')}
                sx={{
                  borderRadius: 0,
                  bgcolor: viewMode === 'map' ? 'action.selected' : 'transparent',
                  px: 1,
                }}
                aria-label={t('pages.venues.mapView', 'Map view')}
              >
                <Map style={{ width: 16, height: 16 }} />
              </IconButton>
            </Box>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/submit/venue')}

            >
              <Plus style={{ width: 14, height: 14 }} />
              Submit
            </Button>
          </Box>
        </Box>

        {/* Content */}
        {viewMode === 'grid' ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {error && !loading && <ErrorState message={error} onRetry={() => fetchVenues()} />}

            {loading && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2.5 }}>
                {Array.from({ length: 8 }).map((_, i) => (<VenueCard key={i} loading />))}
              </Box>
            )}
            {loading && loadingTimedOut && <LoadingTimeout onRetry={() => fetchVenues()} />}

            {!loading && !error && venues.length === 0 && (
              <EmptyState
                icon={MapPin}
                title={t('pages.venues.emptyTitle', 'No spots match your vibe yet')}
                description={t('pages.venues.emptyDescription', 'Try widening your search or explore a different city.')}
                mood="encouraging"
                primaryAction={{
                  label: t('pages.venues.submitVenue', 'Submit a Venue'),
                  onClick: () => navigate('/submit/venue'),
                }}
                secondaryAction={{
                  label: t('pages.venues.clearFilters', 'Clear Filters'),
                  onClick: () => handleFiltersChange({}),
                }}
              />
            )}

            {!loading && venues.length > 0 && (
              <StaggerGrid
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: '1fr 1fr',
                    md: 'repeat(3, 1fr)',
                    lg: 'repeat(4, 1fr)',
                  },
                  gap: 2.5,
                }}
              >
                {sortedVenues.map((venue, index) => (
                  <Box
                    key={venue.id}
                    className={index >= PAGE_SIZE ? 'content-enter' : undefined}
                  >
                    <VenueCard
                      venue={venue}
                      events={events}
                      onViewDetails={handleViewDetails}
                    />
                  </Box>
                ))}
              </StaggerGrid>
            )}

            {/* Infinite scroll sentinel */}
            {!loading && venues.length > 0 && (
              <Box sx={{ textAlign: 'center', mt: 6 }}>
                {hasMore && autoLoadedCount >= 50 && (
                  <Button
                    variant="outline"
                    size="lg"
                    style={{ paddingLeft: 32, paddingRight: 32 }}
                    onClick={async () => {
                      setAutoLoadedCount(0);
                      const nextPage = page + 1;
                      setPage(nextPage);
                      await fetchVenues(currentFilters, {
                        page: nextPage,
                        pageSize: PAGE_SIZE,
                        append: true,
                      });
                    }}
                  >
                    Load More
                  </Button>
                )}
                <Box ref={sentinelRef} sx={{ height: '1px' }} />
              </Box>
            )}
          </Box>
        ) : (
          <Box
            sx={{
              height: 700,
              width: '100%',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <ExploreMap height={700} defaultLayers={['venues']} showLayerToggles showFilters />
          </Box>
        )}
      </Container>
    </Box>
  );
};

export default Venues;
