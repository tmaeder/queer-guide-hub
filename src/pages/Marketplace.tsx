import React from 'react';
import { useState } from 'react';
import { useMarketplace } from '@/hooks/useMarketplace';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { MarketplaceFilters } from '@/components/marketplace/MarketplaceFilters';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Store, Plus, Loader, Heart, Grid, List } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];
const Marketplace = () => {
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
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState('all');
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
    if (!category || category === 'all') return listings;
    return listings.filter(listing => listing.category === category);
  };
  const categories = [{
    id: 'all',
    label: 'All',
    count: listings.length
  }, {
    id: 'products',
    label: 'Products',
    count: listings.filter(l => l.category === 'products').length
  }, {
    id: 'services',
    label: 'Services',
    count: listings.filter(l => l.category === 'services').length
  }];
  if (error) {
    return <div className="min-h-screen">
        <div className="container mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <CardContent>
              <p className="text-destructive mb-4">Error loading marketplace: {error}</p>
              <Button onClick={() => fetchListings()}>Try Again</Button>
            </CardContent>
          </Card>
        </div>
      </div>;
  }
  return <div className="min-h-screen">
      <div className="w-full px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">
              Marketplace
            </h1>
            <p className="text-lg text-muted-foreground">
              Discover and support local businesses offering products and services
            </p>
          </div>
          {user && (
            <Button className="bg-primary gap-2">
              <Plus className="h-4 w-4" />
              List Your Business
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="mb-8">
          <MarketplaceFilters onFiltersChange={handleFiltersChange} />
        </div>

        {/* Category Tabs & View Toggle */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              {categories.map(category => <TabsTrigger key={category.id} value={category.id} className="text-xs">
                  {category.label}
                  <span className="ml-1 text-xs opacity-60">({category.count})</span>
                </TabsTrigger>)}
            </TabsList>
            
            <div className="flex gap-2">
              <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('grid')}>
                <Grid className="h-4 w-4" />
              </Button>
              <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('list')}>
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Loading State */}
          {loading && <div className="flex items-center justify-center py-12">
              <Loader className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading marketplace...</span>
            </div>}

          {/* Empty State */}
          {!loading && listings.length === 0 && <Card className="p-8 text-center">
              <CardContent>
                <Store className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">No listings found</h3>
                <p className="text-muted-foreground mb-4">
                  We couldn't find any listings matching your criteria. Try adjusting your filters or be the first to add your business!
                </p>
                {user && (
                  <Button className="bg-primary">
                    List Your Business
                  </Button>
                )}
              </CardContent>
            </Card>}

          {/* Tab Contents */}
          {categories.map(category => <TabsContent key={category.id} value={category.id} className="bg-background">
              {!loading && getFilteredListings(category.id === 'all' ? undefined : category.id).length > 0 && <>
                  <div className="flex items-center justify-between mb-6">
                    <p className="text-muted-foreground">
                      Found {getFilteredListings(category.id === 'all' ? undefined : category.id).length} listing{getFilteredListings(category.id === 'all' ? undefined : category.id).length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  
                  <div className={viewMode === 'grid' 
                    ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6" 
                    : "space-y-3"
                  }>
                    {getFilteredListings(category.id === 'all' ? undefined : category.id).map(listing => 
                      <div key={listing.id} className="animate-fade-in">
                        <MarketplaceCard 
                          listing={listing} 
                          onViewDetails={handleViewDetails} 
                          onToggleFavorite={user ? handleToggleFavorite : undefined} 
                          showFavoriteButton={!!user} 
                        />
                      </div>
                    )}
                  </div>
                </>}

              {/* Category-specific empty state */}
              {!loading && getFilteredListings(category.id === 'all' ? undefined : category.id).length === 0 && listings.length > 0 && <Card className="p-8 text-center">
                  <CardContent>
                    <Store className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">No {category.label.toLowerCase()} found</h3>
                    <p className="text-muted-foreground mb-4">
                      There are no {category.label.toLowerCase()} matching your current filters.
                    </p>
                    <Button variant="outline" onClick={() => handleFiltersChange({})}>
                      Clear Filters
                    </Button>
                  </CardContent>
                </Card>}
            </TabsContent>)}
        </Tabs>

        {/* Load More */}
        {!loading && listings.length > 0 && <div className="text-center mt-12">
            <Button variant="outline" size="lg">
              Load More Listings
            </Button>
          </div>}
      </div>
    </div>;
};
export default Marketplace;