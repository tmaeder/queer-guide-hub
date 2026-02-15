import React, { useMemo } from 'react';
import { useState } from 'react';
import { useMarketplace } from '@/hooks/useMarketplace';
import { useMeta } from '@/hooks/useMeta';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { MarketplaceFilters } from '@/components/marketplace/MarketplaceFilters';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Store, Plus, Loader, Heart, Grid, List, Grid3X3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';
import { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];
const Marketplace = () => {
  const navigate = useNavigate();
  const {
    listings,
    loading,
    error,
    fetchListings,
    toggleFavorite,
    incrementViews
  } = useMarketplace();
  const {
    user
  } = useAuth();
  const {
    toast
  } = useToast();

  useMeta({
    title: 'Marketplace',
    description: 'Browse queer-friendly businesses, services, and products in the LGBTQ+ marketplace.',
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

  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
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
      case 'newest': return sorted.sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
      case 'oldest': return sorted.sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());
      case 'az': return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'za': return sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
      default: return sorted;
    }
  }, [listings, sortBy]);

  const handleFiltersChange = (filters: any) => {
    fetchListings(filters);
  };
  const handleToggleFavorite = async (listingId: string) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save favorites.",
        variant: "destructive"
      });
      return;
    }
    const {
      favorited,
      error
    } = await toggleFavorite(listingId);
    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive"
      });
    } else {
      toast({
        title: favorited ? "Added to favorites" : "Removed from favorites",
        description: favorited ? "You can find this in your favorites list." : "Item removed from your favorites."
      });
      fetchListings(); // Refresh to show updated favorites
    }
  };
  const handleViewDetails = (listing: MarketplaceListing) => {
    setSelectedListing(listing);
    incrementViews(listing.id);
    // In a real app, this would navigate to a detailed listing page
    console.log('View listing details:', listing);
  };

  // Filter listings by category for tabs
  const getFilteredListings = (category?: string) => {
    if (!category || category === 'all') return sortedListings;
    return sortedListings.filter(listing => listing.category === category);
  };
  const categories = [{
    id: 'all',
    label: 'All',
    count: sortedListings.length
  }, {
    id: 'products',
    label: 'Products',
    count: sortedListings.filter(l => l.category === 'products').length
  }, {
    id: 'services',
    label: 'Services',
    count: sortedListings.filter(l => l.category === 'services').length
  }];
  if (error) {
    return <Box sx={{ minHeight: '100vh' }}>
        <Box sx={{ width: '100%', px: 2, py: 4 }}>
          <Card sx={{ p: 4, textAlign: 'center' }}>
            <CardContent>
              <Typography color="error" sx={{ mb: 2 }}>Something went wrong while loading the marketplace. Please try again.</Typography>
              <Button onClick={() => fetchListings()}>Try Again</Button>
            </CardContent>
          </Card>
        </Box>
      </Box>;
  }
  return <Box sx={{ minHeight: '100vh' }}>
      <Box sx={{ width: '100%', px: 2, py: 4 }}>
        {/* Header */}
        <Card sx={{ mb: 4 }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>
                  Marketplace
                </Typography>
                <Typography variant="subtitle1" color="text.secondary">
                  Discover and support local businesses offering products and services
                </Typography>
              </Box>
              <Button
                style={{ display: 'flex', gap: 8 }}
                onClick={() => {
                  if (!user) {
                    toast({ title: 'Sign in required', description: 'Create a free account to list your business.', variant: 'default' });
                    navigate('/auth');
                    return;
                  }
                  navigate('/marketplace/submit');
                }}
              >
                <Plus style={{ width: 16, height: 16 }} aria-hidden="true" />
                List Your Business
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Filters */}
        <Box sx={{ mb: 4 }}>
          <MarketplaceFilters onFiltersChange={handleFiltersChange} />
        </Box>

        {/* Category Tabs & View Toggle */}
        <Tabs value={activeTab} onValueChange={setActiveTab} style={{ marginBottom: 24 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <TabsList style={{ display: 'grid', width: '100%', maxWidth: '28rem', gridTemplateColumns: '1fr 1fr 1fr' }}>
              {categories.map(category => <TabsTrigger key={category.id} value={category.id} style={{ fontSize: '0.75rem' }}>
                  {category.label}
                  <span style={{ marginLeft: 4, fontSize: '0.75rem', opacity: 0.6 }}>({category.count})</span>
                </TabsTrigger>)}
            </TabsList>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger style={{ width: 160 }} aria-label="Sort listings">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('grid')} aria-label="Grid view">
                <Grid style={{ width: 16, height: 16 }} />
              </Button>
              <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('list')} aria-label="List view">
                <List style={{ width: 16, height: 16 }} />
              </Button>
            </Box>
          </Box>

          {/* Loading State */}
          {loading && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6 }}>
              <Loader style={{ width: 32, height: 32, color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
              <Typography color="text.secondary" sx={{ ml: 1 }}>Loading marketplace...</Typography>
            </Box>}

          {/* Empty State */}
          {!loading && sortedListings.length === 0 && <Card sx={{ p: 4, textAlign: 'center' }}>
              <CardContent>
                <Store style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>No listings found</Typography>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  We couldn't find any listings matching your criteria. Try adjusting your filters or be the first to add your business!
                </Typography>
                <Button onClick={() => {
                  if (!user) {
                    toast({ title: 'Sign in required', description: 'Create a free account to list your business.', variant: 'default' });
                    navigate('/auth');
                    return;
                  }
                  navigate('/marketplace/submit');
                }}>
                  <Plus style={{ width: 16, height: 16, marginRight: 8 }} aria-hidden="true" />
                  List Your Business
                </Button>
              </CardContent>
            </Card>}

          {/* Tab Contents */}
          {categories.map(category => <TabsContent key={category.id} value={category.id}>
              {!loading && getFilteredListings(category.id === 'all' ? undefined : category.id).length > 0 && <>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                    <Typography color="text.secondary">
                      Found {getFilteredListings(category.id === 'all' ? undefined : category.id).length} listing{getFilteredListings(category.id === 'all' ? undefined : category.id).length !== 1 ? 's' : ''}
                    </Typography>
                  </Box>

                  <Box sx={viewMode === 'grid'
                    ? { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)', '2xl': 'repeat(4, 1fr)' }, gap: { xs: 2, sm: 3 } }
                    : { display: 'flex', flexDirection: 'column', gap: 1.5 }
                  }>
                    {getFilteredListings(category.id === 'all' ? undefined : category.id).map(listing =>
                      <Box key={listing.id}>
                        <MarketplaceCard
                          listing={listing}
                          onViewDetails={handleViewDetails}
                          onToggleFavorite={user ? handleToggleFavorite : undefined}
                          showFavoriteButton={!!user}
                        />
                      </Box>
                    )}
                  </Box>
                </>}

              {/* Category-specific empty state */}
              {!loading && getFilteredListings(category.id === 'all' ? undefined : category.id).length === 0 && sortedListings.length > 0 && <Card sx={{ p: 4, textAlign: 'center' }}>
                  <CardContent>
                    <Store style={{ width: 48, height: 48, margin: '0 auto 16px', color: 'var(--muted-foreground)' }} />
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>No {category.label.toLowerCase()} found</Typography>
                    <Typography color="text.secondary" sx={{ mb: 2 }}>
                      There are no {category.label.toLowerCase()} matching your current filters.
                    </Typography>
                    <Button variant="outline" onClick={() => handleFiltersChange({})}>
                      Clear Filters
                    </Button>
                  </CardContent>
                </Card>}
            </TabsContent>)}
        </Tabs>

      </Box>
    </Box>;
};
export default Marketplace;
