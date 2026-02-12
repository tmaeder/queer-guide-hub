import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useMeta } from '@/hooks/useMeta';
import { useAuth } from '@/hooks/useAuth';
import { VenueCard } from '@/components/venues/VenueCard';
import { VenueFilters } from '@/components/venues/VenueFilters';
import { VenueMapSearch } from '@/components/venues/VenueMapSearch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Plus, Loader, Grid, Map, SortAsc, SortDesc, Filter } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

type Venue = Database['public']['Tables']['venues']['Row'];

const Venues = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { venues, loading, error, hasMore, fetchVenues } = useVenues(false);

  useMeta({
    title: 'Venues',
    description: 'Discover queer-friendly venues, businesses, and organizations worldwide. Find safe spaces near you.',
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
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [currentFilters, setCurrentFilters] = useState<any>({});
  const [sortBy, setSortBy] = useState<string>('featured');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [autoLoadedCount, setAutoLoadedCount] = useState(0);

// removed duplicate pagination state
  const handleFiltersChange = async (filters: any) => {
    setCurrentFilters(filters);
    setPage(1);
    setAutoLoadedCount(0);
    await fetchVenues(filters, { page: 1, pageSize: PAGE_SIZE, append: false });
  };

  const handleAmenityClick = async (amenity: string) => {
    const filters = { amenities: [amenity] };
    setCurrentFilters(filters);
    setPage(1);
    setAutoLoadedCount(0);
    await fetchVenues(filters, { page: 1, pageSize: PAGE_SIZE, append: false });
  };

  const handleServiceClick = async (service: string) => {
    const filters = { services: [service] };
    setCurrentFilters(filters);
    setPage(1);
    setAutoLoadedCount(0);
    await fetchVenues(filters, { page: 1, pageSize: PAGE_SIZE, append: false });
  };

  const handleTagClick = async (tag: string) => {
    const filters = { tags: [tag] };
    setCurrentFilters(filters);
    setPage(1);
    setAutoLoadedCount(0);
    await fetchVenues(filters, { page: 1, pageSize: PAGE_SIZE, append: false });
  };

  const handleViewDetails = (venue: Venue) => {
    setSelectedVenue(venue);
    // In a real app, this would navigate to a detailed venue page
    console.log('View venue details:', venue);
  };

  // Sort venues based on current sort settings
  const sortedVenues = useMemo(() => {
    if (!venues || venues.length === 0) return [];

    if (sortBy === 'featured') {
      // Featured venues first, then alphabetical by name
      return [...venues].sort((a, b) => {
        const aFeat = a.featured ? 1 : 0;
        const bFeat = b.featured ? 1 : 0;
        if (aFeat !== bFeat) return bFeat - aFeat;
        return (a.name || '').localeCompare(b.name || '');
      });
    }

    // Regular sorting for other options
    return [...venues].sort((a, b) => {
      let aValue: any, bValue: any;

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

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [venues, sortBy, sortOrder]);

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  // Initial fetch
  useEffect(() => {
    (async () => {
      setPage(1);
      setAutoLoadedCount(0);
      await fetchVenues(currentFilters, { page: 1, pageSize: PAGE_SIZE, append: false });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IntersectionObserver for infinite scroll with 50 autoload cap
  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const observer = new IntersectionObserver(async (entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && !loading && hasMore && autoLoadedCount < 50) {
        const nextPage = page + 1;
        setPage(nextPage);
        const result: any = await fetchVenues(currentFilters, { page: nextPage, pageSize: PAGE_SIZE, append: true });
        const fetched = result?.fetched ?? PAGE_SIZE;
        setAutoLoadedCount((c) => Math.min(50, c + fetched));
      }
    }, { rootMargin: '200px' });

    observer.observe(el);
    return () => observer.unobserve(el);
  }, [page, loading, hasMore, currentFilters, autoLoadedCount]);
  if (error) {
    return (
      <Box sx={{ minHeight: '100vh' }}>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Card>
            <CardContent sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="error" sx={{ mb: 2 }}>Something went wrong while loading venues. Please try again.</Typography>
              <Button onClick={() => fetchVenues()}>Try Again</Button>
            </CardContent>
          </Card>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Header */}
        <Card sx={{ mb: 4 }}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h3" sx={{ fontWeight: 700, mb: 2, '@keyframes fadeIn': { from: { opacity: 0 }, to: { opacity: 1 } }, animation: 'fadeIn 0.5s ease-in' }}>
              Venues
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ mb: 4, maxWidth: '42rem', mx: 'auto' }}>
              Discover queer-friendly venues, businesses, and organizations in your area
            </Typography>
            {user && (
              <Button
                style={{ display: 'inline-flex', gap: 8, paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: '1.125rem' }}
                onClick={() => navigate('/admin/venues')}
              >
                <Plus style={{ width: 20, height: 20 }} />
                Add Your Business
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Filters Section */}
        <Box sx={{ mb: 4 }}>
          <VenueFilters onFiltersChange={handleFiltersChange} />
        </Box>

        {/* Results Header with Sorting */}
        {!loading && venues.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2, mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 2, border: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                Found {venues.length} result{venues.length !== 1 ? 's' : ''}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Filter style={{ width: 16, height: 16 }} />
                <Typography variant="body2" color="text.secondary">
                  {Object.keys(currentFilters).length > 0 && `${Object.keys(currentFilters).length} filter${Object.keys(currentFilters).length !== 1 ? 's' : ''} applied`}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">Sort by:</Typography>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger style={{ width: 128 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="featured">Featured</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="category">Category</SelectItem>
                    <SelectItem value="city">City</SelectItem>
                    <SelectItem value="created_at">Newest</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSortOrder}
                  style={{ paddingLeft: 8, paddingRight: 8 }}
                >
                  {sortOrder === 'asc' ? <SortAsc style={{ width: 16, height: 16 }} /> : <SortDesc style={{ width: 16, height: 16 }} />}
                </Button>
              </Box>
            </Box>
          </Box>
        )}

        {/* Content Tabs */}
        <Tabs value={viewMode === 'grid' ? 'grid' : 'map'} onValueChange={(value) => setViewMode(value as 'grid' | 'list')}>
          <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: '1fr 1fr', marginBottom: 32, maxWidth: 448, marginLeft: 'auto', marginRight: 'auto' }}>
            <TabsTrigger value="grid" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Grid style={{ width: 16, height: 16 }} />
              Grid View
            </TabsTrigger>
            <TabsTrigger value="map" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Map style={{ width: 16, height: 16 }} />
              Map View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="grid">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Loading State */}
              {loading && (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10 }}>
                  <Loader style={{ width: 48, height: 48, color: 'var(--primary)', marginBottom: 16, animation: 'spin 1s linear infinite' }} />
                  <Typography variant="subtitle1" color="text.secondary">Finding amazing places for you...</Typography>
                </Box>
              )}

              {/* Empty State */}
              {!loading && venues.length === 0 && (
                <Card>
                  <CardContent sx={{ p: 6, textAlign: 'center' }}>
                    <MapPin style={{ width: 64, height: 64, margin: '0 auto 24px', color: 'var(--muted-foreground)' }} />
                    <Typography variant="h5" sx={{ fontWeight: 600, mb: 1.5 }}>No venues found</Typography>
                    <Typography color="text.secondary" sx={{ mb: 3, maxWidth: '28rem', mx: 'auto' }}>
                      We couldn't find any venues matching your criteria. Try adjusting your filters or be the first to add a venue in this area!
                    </Typography>
                    {user && (
                      <Button
                        style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12 }}
                        onClick={() => navigate('/admin/venues')}
                      >
                        Add the First Venue
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Venues Grid */}
              {!loading && venues.length > 0 && (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 3 }}>
                  {sortedVenues.map((venue, index) => (
                    <Box
                      key={venue.id}
                      sx={{ '&:hover': { transform: 'scale(1.02)' }, transition: 'transform 200ms' }}
                    >
                      <VenueCard
                        venue={venue}
                        events={events}
                        onViewDetails={handleViewDetails}
                        onAmenityClick={handleAmenityClick}
                        onServiceClick={handleServiceClick}
                        onTagClick={handleTagClick}
                      />
                    </Box>
                  ))}
                </Box>
              )}

              {/* Infinite scroll sentinel and manual load control */}
              {!loading && venues.length > 0 && (
                <Box sx={{ textAlign: 'center', mt: 8 }}>
                  {hasMore && autoLoadedCount >= 50 && (
                    <Button
                      variant="outline"
                      size="lg"
                      style={{ paddingLeft: 32, paddingRight: 32, paddingTop: 12, paddingBottom: 12 }}
                      onClick={async () => {
                        setAutoLoadedCount(0);
                        const nextPage = page + 1;
                        setPage(nextPage);
                        await fetchVenues(currentFilters, { page: nextPage, pageSize: PAGE_SIZE, append: true });
                      }}
                    >
                      Load More Results
                    </Button>
                  )}
                  {/* Sentinel always rendered to continue observing */}
                  <Box ref={sentinelRef} sx={{ height: '1px' }} />
                </Box>
              )}
            </Box>
          </TabsContent>

          <TabsContent value="map">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ height: 700, width: '100%', borderRadius: 2, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
                <VenueMapSearch filters={currentFilters} />
              </Box>
            </Box>
          </TabsContent>
        </Tabs>
      </Container>
    </Box>
  );
};

export default Venues;
