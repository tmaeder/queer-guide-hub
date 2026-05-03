import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useMeta } from '@/hooks/useMeta';
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
import { MapPin, Grid, Map } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

type Venue = Database['public']['Tables']['venues']['Row'];

const Venues = () => {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { venues, loading, error, hasMore, datasetTotal, fetchVenues, loadingTimedOut } = useVenues(false);

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

  const gridClass =
    'grid gap-5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';

  return (
    <div className="min-h-screen">
      <div className="mx-auto w-full max-w-screen-xl px-4 py-6 md:py-10">
        <VenueFilters onFiltersChange={handleFiltersChange} />

        {/* Toolbar */}
        <div className="mb-4 mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {!loading && venues.length > 0 && (
              <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
                {(datasetTotal ?? venues.length).toLocaleString()} venue
                {(datasetTotal ?? venues.length) !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger
                aria-label={t('pages.venues.sortBy', 'Sort venues')}
                className="w-32 h-9 text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="featured">
                  {t('pages.venues.sortFeatured', 'Featured')}
                </SelectItem>
                <SelectItem value="name">{t('pages.venues.sortName', 'Name')}</SelectItem>
                <SelectItem value="category">
                  {t('pages.venues.sortCategory', 'Category')}
                </SelectItem>
                <SelectItem value="city">{t('pages.venues.sortCity', 'City')}</SelectItem>
                <SelectItem value="created_at">
                  {t('pages.venues.sortNewest', 'Newest')}
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="flex overflow-hidden rounded-md">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('grid')}
                className={cn(
                  'h-9 w-9 rounded-none px-2',
                  viewMode === 'grid' && 'bg-accent',
                )}
                aria-label={t('pages.venues.gridView', 'Grid view')}
              >
                <Grid size={16} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('map')}
                className={cn(
                  'h-9 w-9 rounded-none px-2',
                  viewMode === 'map' && 'bg-accent',
                )}
                aria-label={t('pages.venues.mapView', 'Map view')}
              >
                <Map size={16} />
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        {viewMode === 'grid' ? (
          <div className="flex flex-col gap-6">
            {error && !loading && <ErrorState message={error} onRetry={() => fetchVenues()} />}

            {loading && (
              <div className={gridClass}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <VenueCard key={i} loading />
                ))}
              </div>
            )}
            {loading && loadingTimedOut && <LoadingTimeout onRetry={() => fetchVenues()} />}

            {!loading && !error && venues.length === 0 && (
              datasetTotal === 0 || (datasetTotal === null && Object.keys(currentFilters).length === 0) ? (
                <EmptyState
                  icon={MapPin}
                  variant="empty"
                  title={t('pages.venues.emptyDataset.title', 'No venues yet')}
                  description={t(
                    'pages.venues.emptyDataset.body',
                    "We haven't added any venues here yet. Help us grow the guide by submitting one.",
                  )}
                  primaryAction={{
                    label: t('pages.venues.submitVenue', 'Submit a Venue'),
                    onClick: () => navigate('/submit/venue'),
                  }}
                />
              ) : (
                <EmptyState
                  icon={MapPin}
                  variant="filtered"
                  title={t('pages.venues.filteredEmpty.title', 'No venues match your filters')}
                  description={t(
                    'pages.venues.filteredEmpty.body',
                    'Try adjusting your filters or search to see more results.',
                  )}
                  primaryAction={{
                    label: t('pages.venues.submitVenue', 'Submit a Venue'),
                    onClick: () => navigate('/submit/venue'),
                  }}
                  secondaryAction={
                    Object.keys(currentFilters).length > 0
                      ? {
                          label: t('pages.venues.clearFilters', 'Clear Filters'),
                          onClick: () => handleFiltersChange({}),
                          variant: 'outline',
                        }
                      : undefined
                  }
                />
              )
            )}

            {!loading && venues.length > 0 && (
              <StaggerGrid className={gridClass}>
                {sortedVenues.map((venue, index) => (
                  <div
                    key={venue.id}
                    className={index >= PAGE_SIZE ? 'content-enter' : undefined}
                  >
                    <VenueCard venue={venue} events={events} onViewDetails={handleViewDetails} />
                  </div>
                ))}
              </StaggerGrid>
            )}

            {!loading && venues.length > 0 && (
              <div className="mt-12 text-center">
                {hasMore && autoLoadedCount >= 50 && (
                  <Button
                    variant="outline"
                    size="lg"
                    className="px-8"
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
                    {t('common.loadMore', 'Load more')}
                  </Button>
                )}
                <div ref={sentinelRef} className="h-px" />
              </div>
            )}
          </div>
        ) : (
          <div className="h-[700px] w-full overflow-hidden rounded-lg">
            <ExploreMap height={700} defaultLayers={['venues']} showLayerToggles showFilters />
          </div>
        )}
      </div>
    </div>
  );
};

export default Venues;
