import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMarketplace, type MarketplaceSort, type MarketplaceFiltersInput } from '@/hooks/useMarketplace';
import { useMeta } from '@/hooks/useMeta';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { MarketplaceFilters } from '@/components/marketplace/MarketplaceFilters';
import { MarketplaceSpotlight } from '@/components/marketplace/MarketplaceSpotlight';
import { MarketplaceCategoryTiles } from '@/components/marketplace/MarketplaceCategoryTiles';
import { MarketplaceCityChips } from '@/components/marketplace/MarketplaceCityChips';
import { MarketplaceRow } from '@/components/marketplace/MarketplaceRow';
import { SavedSearchesButton } from '@/components/marketplace/SavedSearchesButton';
import { AffiliateDisclosure } from '@/components/marketplace/AffiliateDisclosure';
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
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { useTranslation } from 'react-i18next';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

const VALID_TABS = ['all', 'products', 'services'] as const;
const VALID_SORTS = ['newest', 'oldest', 'az', 'za', 'price_asc', 'price_desc', 'most_viewed'] as const;

const Marketplace = () => {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    listings,
    total,
    pageSize,
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

  const rawTab = searchParams.get('tab') || 'all';
  const activeTab = (VALID_TABS as readonly string[]).includes(rawTab) ? rawTab : 'all';
  const rawSort = searchParams.get('sort') || 'newest';
  const sortBy = (VALID_SORTS as readonly string[]).includes(rawSort) ? (rawSort as MarketplaceSort) : 'newest';
  const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10) || 0);
  const qParam = searchParams.get('q') || '';

  const [filters, setFilters] = useState<MarketplaceFiltersInput>(() => {
    const init: MarketplaceFiltersInput = {};
    if (qParam) init.search = qParam;
    return init;
  });

  const [_selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [accumulated, setAccumulated] = useState<MarketplaceListing[]>([]);

  const sortOptions = [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'price_asc', label: 'Price: low to high' },
    { value: 'price_desc', label: 'Price: high to low' },
    { value: 'most_viewed', label: 'Most viewed' },
    { value: 'az', label: 'A–Z' },
    { value: 'za', label: 'Z–A' },
  ];

  const setUrlParams = (updates: Record<string, string | undefined>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (!v || v === 'all' || v === 'newest' || v === '0') {
          next.delete(k);
        } else {
          next.set(k, v);
        }
      }
      return next;
    }, { replace: true });
  };

  const combinedFilters = useMemo<MarketplaceFiltersInput>(() => {
    const merged = { ...filters };
    if (activeTab !== 'all') merged.category = activeTab;
    return merged;
  }, [filters, activeTab]);

  const hasActiveFilters = useMemo(() => {
    const f = combinedFilters;
    return Boolean(
      f.search ||
        f.category ||
        f.subcategory ||
        f.location ||
        f.businessType ||
        f.priceRange ||
        (f.tags && f.tags.length > 0),
    );
  }, [combinedFilters]);

  useEffect(() => {
    fetchListings(combinedFilters, page, sortBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, activeTab, JSON.stringify(combinedFilters)]);

  useEffect(() => {
    if (page === 0) {
      setAccumulated(listings);
    } else if (listings.length > 0) {
      setAccumulated((prev) => {
        const seen = new Set(prev.map((l) => l.id));
        const merged = [...prev];
        for (const l of listings) if (!seen.has(l.id)) merged.push(l);
        return merged;
      });
    }
  }, [listings, page]);

  const handleFiltersChange = (next: Record<string, unknown>) => {
    setFilters(next as MarketplaceFiltersInput);
    const q = (next as MarketplaceFiltersInput).search || '';
    setUrlParams({ q: q || undefined, page: undefined });
  };

  const handleTabChange = (tab: string) => {
    setUrlParams({ tab: tab === 'all' ? undefined : tab, page: undefined });
  };

  const handleSortChange = (s: string) => {
    setUrlParams({ sort: s === 'newest' ? undefined : s, page: undefined });
  };

  const handleLoadMore = () => {
    setUrlParams({ page: String(page + 1) });
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
      toast({ title: 'Error', description: error, variant: 'destructive' });
    } else {
      toast({
        title: favorited ? 'Added to favorites' : 'Removed from favorites',
        description: favorited ? 'You can find this in your favorites list.' : 'Item removed from your favorites.',
      });
      fetchListings(combinedFilters, page, sortBy);
    }
  };

  const handleViewDetails = (listing: MarketplaceListing) => {
    setSelectedListing(listing);
    incrementViews(listing.id);
  };

  const totalPages = Math.ceil(total / pageSize);
  const canLoadMore = page < totalPages - 1;

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'products', label: 'Products' },
    { id: 'services', label: 'Services' },
  ];

  return (
    <div className="min-h-screen">
      <div className="container mx-auto py-12 md:py-20 px-4">
        <PageHeader
          title={t('pages.marketplace.title', 'Marketplace')}
          subtitle={t('pages.marketplace.subtitle', 'Queer-friendly products and services.')}
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

        {!hasActiveFilters && (
          <>
            <MarketplaceSpotlight />
            <MarketplaceCategoryTiles />
            <MarketplaceRow rowKey="new" title="New this week" subtitle="Fresh arrivals from the past 14 days" />
            <MarketplaceRow rowKey="price-drops" title="Price drops" subtitle="Recently discounted listings" />
            <MarketplaceRow
              rowKey="most-relevant"
              title="Most LGBTQ+ relevant"
              subtitle="Highest relevance score from our review"
            />
            <MarketplaceRow rowKey="featured" title="Editor's picks" subtitle="Hand-selected by our team" />
            <MarketplaceCityChips />
          </>
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange} style={{ marginBottom: 24 }}>
          <div className="sticky top-0 z-20 border border-border rounded-lg p-4 mb-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="mb-4">
              <MarketplaceFilters initialSearch={qParam} onFiltersChange={handleFiltersChange} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList
                style={{
                  display: 'grid',
                  width: '100%',
                  maxWidth: '28rem',
                  gridTemplateColumns: '1fr 1fr 1fr',
                }}
              >
                {categories.map((category) => (
                  <TabsTrigger key={category.id} value={category.id} style={{ fontSize: '0.75rem' }}>
                    {category.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex items-center gap-3">
                <SavedSearchesButton />
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger style={{ width: 200 }} aria-label="Sort listings">
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
              </div>
            </div>
          </div>

          {error && (
            <ErrorState
              message={t('pages.marketplace.loadError', 'Something went wrong while loading the marketplace. Please try again.')}
              onRetry={() => fetchListings(combinedFilters, page, sortBy)}
            />
          )}

          {!error && loading && loadingTimedOut && <LoadingTimeout onRetry={() => fetchListings(combinedFilters, page, sortBy)} />}
          {!error && loading && !loadingTimedOut && accumulated.length === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <MarketplaceCard key={i} loading />
              ))}
            </div>
          )}

          {!error && !loading && accumulated.length === 0 && (
            <EmptyState
              icon={Store}
              title={
                hasActiveFilters
                  ? t('pages.marketplace.emptyFiltersTitle', 'No listings match these filters.')
                  : t('pages.marketplace.emptyTitle', 'No listings yet.')
              }
              description={
                hasActiveFilters
                  ? t('pages.marketplace.emptyFiltersDescription', 'Try clearing filters or broadening your search.')
                  : t('pages.marketplace.emptyDescription', 'Check back soon or list your business.')
              }
              mood="neutral"
              primaryAction={
                hasActiveFilters
                  ? { label: 'Clear filters', onClick: () => handleFiltersChange({}) }
                  : {
                      label: 'List Your Business',
                      onClick: () => {
                        if (!user) {
                          toast({ title: 'Sign in required', description: 'Create a free account to list your business.', variant: 'default' });
                          navigate('/auth');
                          return;
                        }
                        navigate('/marketplace/submit');
                      },
                    }
              }
            />
          )}

          <TabsContent value={activeTab}>
            {!error && accumulated.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <p className="text-muted-foreground">
                    {accumulated.length === total
                      ? `${total} listing${total !== 1 ? 's' : ''}`
                      : `Showing ${accumulated.length} of ${total} listings`}
                  </p>
                </div>

                <StaggerGrid
                  className={
                    viewMode === 'grid'
                      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6'
                      : 'flex flex-col gap-3'
                  }
                >
                  {accumulated.map((listing) => (
                    <div key={listing.id}>
                      <MarketplaceCard
                        listing={listing}
                        onViewDetails={handleViewDetails}
                        onToggleFavorite={user ? handleToggleFavorite : undefined}
                        showFavoriteButton={!!user}
                        searchQuery={filters.search}
                      />
                    </div>
                  ))}
                </StaggerGrid>

                {canLoadMore && (
                  <div className="flex items-center justify-center mt-10">
                    <Button onClick={handleLoadMore} variant="outline" size="lg" disabled={loading}>
                      {loading ? 'Loading…' : 'Load more'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        <AffiliateDisclosure />
      </div>
    </div>
  );
};
export default Marketplace;
