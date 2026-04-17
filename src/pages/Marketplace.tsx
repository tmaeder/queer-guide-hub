import { useMemo } from 'react';
import { useState } from 'react';
import { useMarketplace } from '@/hooks/useMarketplace';
import { useMeta } from '@/hooks/useMeta';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { MarketplaceFilters } from '@/components/marketplace/MarketplaceFilters';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Store, Plus, Grid, List } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { EmptyState, ErrorState, LoadingTimeout } from '@/components/ui/EmptyState';
import { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import Box from '@mui/material/Box';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';import { useTranslation } from 'react-i18next';


type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];
const Marketplace = () => {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const {
    listings,
    loading,
    loadingTimedOut,
    error,
    fetchListings,
    toggleFavorite,
    incrementViews,
  } = useMarketplace();
  const { user } = useAuth();
  const { toast } = useToast();

  useMeta({
    title: 'Marketplace',
    description:
      'Browse queer-friendly businesses, services, and products in the LGBTQ+ marketplace.',
    canonicalPath: '/marketplace',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'LGBTQ+ Marketplace',
      description: 'Browse queer-friendly businesses, services, and products.',
      url: 'https://queer.guide/marketplace',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
    },
  });

  const [_selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState('all');
  const [sortBy, setSortBy] = useState<string>('newest');

  const sortOptions = [
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
    { value: 'az', label: 'A\u2013Z' },
    { value: 'za', label: 'Z\u2013A' },
  ];

  const sortedListings = useMemo(() => {
    const sorted = [...listings];
    switch (sortBy) {
      case 'newest':
        return sorted.sort(
          (a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime(),
        );
      case 'oldest':
        return sorted.sort(
          (a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime(),
        );
      case 'az':
        return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'za':
        return sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
      default:
        return sorted;
    }
  }, [listings, sortBy]);

  const handleFiltersChange = (filters: Record<string, unknown>) => {
    fetchListings(filters);
  };
  const handleToggleFavorite = async (listingId: string) => {
    if (!user) {
      toast({
        title: t('pages.marketplace.signInRequired', 'Sign in required'),
        description: t('pages.marketplace.signInFavorites', 'Please sign in to save favorites.'),
        variant: 'destructive',
      });
      return;
    }
    const { favorited, error } = await toggleFavorite(listingId);
    if (error) {
      toast({
        title: 'Error',
        description: error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: favorited ? 'Added to favorites' : 'Removed from favorites',
        description: favorited
          ? 'You can find this in your favorites list.'
          : 'Item removed from your favorites.',
      });
      fetchListings(); // Refresh to show updated favorites
    }
  };
  const handleViewDetails = (listing: MarketplaceListing) => {
    setSelectedListing(listing);
    incrementViews(listing.id);
  };

  // Filter listings by category for tabs
  const getFilteredListings = (category?: string) => {
    if (!category || category === 'all') return sortedListings;
    return sortedListings.filter((listing) => listing.category === category);
  };
  const categories = [
    {
      id: 'all',
      label: 'All',
      count: sortedListings.length,
    },
    {
      id: 'products',
      label: 'Products',
      count: sortedListings.filter((l) => l.category === 'products').length,
    },
    {
      id: 'services',
      label: 'Services',
      count: sortedListings.filter((l) => l.category === 'services').length,
    },
  ];
  if (error) {
    return (
      <Box sx={{ minHeight: '100vh' }}>
        <Container sx={{ py: { xs: 6, md: 10 } }}>
          <ErrorState
            message={t('pages.marketplace.loadError', 'Something went wrong while loading the marketplace. Please try again.')}
            onRetry={() => fetchListings()}
          />
        </Container>
      </Box>
    );
  }
  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Container sx={{ py: { xs: 6, md: 10 } }}>
        {/* Header */}
        <PageHeader
          title={t('pages.marketplace.title', 'Marketplace')}
          subtitle={t('pages.marketplace.subtitle', 'Discover and support local businesses offering products and services')}
          actions={
            <Button
              style={{ display: 'flex', gap: 8 }}
              onClick={() => {
                if (!user) {
                  toast({
                    title: 'Sign in required',
                    description: t('pages.marketplace.signInList', 'Create a free account to list your business.'),
                    variant: 'default',
                  });
                  navigate('/auth');
                  return;
                }
                navigate('/marketplace/submit');
              }}
            >
              <Plus style={{ width: 16, height: 16 }} aria-hidden="true" />
              List Your Business
            </Button>
          }
        />

        {/* Filters & Category Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} style={{ marginBottom: 24 }}>
          <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'background.paper' }}>
            {/* Filters */}
            <Box sx={{ mb: 2 }}>
              <MarketplaceFilters onFiltersChange={handleFiltersChange} />
            </Box>

            {/* Category Tabs & View Toggle */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <TabsList
                style={{
                  display: 'grid',
                  width: '100%',
                  maxWidth: '28rem',
                  gridTemplateColumns: '1fr 1fr 1fr',
                }}
              >
                {categories.map((category) => (
                  <TabsTrigger
                    key={category.id}
                    value={category.id}
                    style={{ fontSize: '0.75rem' }}
                  >
                    {category.label}
                    <span style={{ marginLeft: 4, fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                      ({category.count})
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger style={{ width: 160 }} aria-label="Sort listings">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                >
                  <Grid style={{ width: 16, height: 16 }} />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                >
                  <List style={{ width: 16, height: 16 }} />
                </Button>
              </Box>
            </Box>
          </Paper>

          {/* Loading State */}
          {loading && loadingTimedOut && <LoadingTimeout onRetry={() => fetchListings()} />}
          {loading && !loadingTimedOut && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
              {Array.from({ length: 6 }).map((_, i) => (<MarketplaceCard key={i} loading />))}
            </Box>
          )}

          {/* Empty State */}
          {!loading && sortedListings.length === 0 && (
            <EmptyState
              icon={Store}
              title={t('pages.marketplace.emptyTitle', 'Nothing on the shelves yet')}
              description={t('pages.marketplace.emptyDescription', 'Queer-owned businesses are joining every day.')}
              mood="encouraging"
              primaryAction={{
                label: 'List Your Business',
                onClick: () => {
                  if (!user) {
                    toast({
                      title: 'Sign in required',
                      description: 'Create a free account to list your business.',
                      variant: 'default',
                    });
                    navigate('/auth');
                    return;
                  }
                  navigate('/marketplace/submit');
                },
              }}
              secondaryAction={{ label: 'Clear Filters', onClick: () => handleFiltersChange({}) }}
            />
          )}

          {/* Tab Contents */}
          {categories.map((category) => (
            <TabsContent key={category.id} value={category.id}>
              {!loading &&
                getFilteredListings(category.id === 'all' ? undefined : category.id).length > 0 && (
                  <>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: 3,
                      }}
                    >
                      <Typography color="text.secondary">
                        Found{' '}
                        {
                          getFilteredListings(category.id === 'all' ? undefined : category.id)
                            .length
                        }{' '}
                        listing
                        {getFilteredListings(category.id === 'all' ? undefined : category.id)
                          .length !== 1
                          ? 's'
                          : ''}
                      </Typography>
                    </Box>

                    <StaggerGrid
                      sx={
                        viewMode === 'grid'
                          ? {
                              display: 'grid',
                              gridTemplateColumns: {
                                xs: '1fr',
                                sm: '1fr 1fr',
                                lg: 'repeat(3, 1fr)',
                                '2xl': 'repeat(4, 1fr)',
                              },
                              gap: { xs: 2, sm: 3 },
                            }
                          : { display: 'flex', flexDirection: 'column', gap: 1.5 }
                      }
                    >
                      {getFilteredListings(category.id === 'all' ? undefined : category.id).map(
                        (listing) => (
                          <Box key={listing.id}>
                            <MarketplaceCard
                              listing={listing}
                              onViewDetails={handleViewDetails}
                              onToggleFavorite={user ? handleToggleFavorite : undefined}
                              showFavoriteButton={!!user}
                            />
                          </Box>
                        ),
                      )}
                    </StaggerGrid>
                  </>
                )}

              {/* Category-specific empty state */}
              {!loading &&
                getFilteredListings(category.id === 'all' ? undefined : category.id).length === 0 &&
                sortedListings.length > 0 && (
                  <EmptyState
                    icon={Store}
                    title="Nothing on the shelves yet"
                    description="Queer-owned businesses are joining every day."
                    mood="encouraging"
                    primaryAction={{
                      label: 'Clear Filters',
                      onClick: () => handleFiltersChange({}),
                      variant: 'outline',
                    }}
                  />
                )}
            </TabsContent>
          ))}
        </Tabs>
      </Container>
    </Box>
  );
};
export default Marketplace;
