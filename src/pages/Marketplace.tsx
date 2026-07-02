import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  useMarketplace,
  type MarketplaceSort,
  type MarketplaceFiltersInput,
} from '@/hooks/useMarketplace';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useMeta } from '@/hooks/useMeta';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { MarketplaceFilters } from '@/components/marketplace/MarketplaceFilters';
import { MarketplaceCategoryTiles } from '@/components/marketplace/MarketplaceCategoryTiles';
import { OccasionChips } from '@/components/marketplace/OccasionChips';
import { HeroCollection } from '@/components/marketplace/HeroCollection';
import { GuidesStream } from '@/components/marketplace/GuidesStream';
import { ContinueReadingRail } from '@/components/marketplace/ContinueReadingRail';
import { AdultContentGate } from '@/components/marketplace/AdultContentGate';
import { isAdultListing, useAdultAcknowledgement } from '@/hooks/useAdultContent';
import { MarketplaceRow } from '@/components/marketplace/MarketplaceRow';
import { SavedSearchesButton } from '@/components/marketplace/SavedSearchesButton';
import { AffiliateDisclosure } from '@/components/marketplace/AffiliateDisclosure';
import { CuratedIdsProvider } from '@/components/marketplace/CuratedIdsContext';
import { useCuratedIds } from '@/components/marketplace/useCuratedIds';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Store, Plus, Grid, List, ArrowRight } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { EmptyState, ErrorState, LoadingTimeout } from '@/components/ui/EmptyState';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { PageHero } from '@/components/discovery';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { useTranslation } from 'react-i18next';
import { buildEmptyTitle, buildLooseningSuggestion } from '@/components/marketplace/marketplaceEmptyState';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

interface MainGridSectionProps {
  accumulated: MarketplaceListing[];
  total: number;
  page: number;
  hasActiveFilters: boolean;
  viewMode: 'grid' | 'list';
  listingAssets: Map<string, import('@/hooks/useEntityImageAssets').EntityImageAsset>;
  searchQuery: string | undefined;
  userPresent: boolean;
  onViewDetails: (listing: MarketplaceListing) => void;
  onToggleFavorite: (id: string) => void;
  canLoadMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

function MainGridSection({
  accumulated,
  total,
  page,
  hasActiveFilters,
  viewMode,
  listingAssets,
  searchQuery,
  userPresent,
  onViewDetails,
  onToggleFavorite,
  canLoadMore,
  loading,
  onLoadMore,
}: MainGridSectionProps) {
  const { ids: curatedIds } = useCuratedIds();
  const visible = useMemo(() => {
    if (page > 0 || hasActiveFilters || curatedIds.size === 0) return accumulated;
    return accumulated.filter((l) => !curatedIds.has(l.id));
  }, [accumulated, page, hasActiveFilters, curatedIds]);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground">
          Showing {visible.length.toLocaleString()} of {total.toLocaleString()} listing
          {total !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Calm uniform grid — editorial rhythm beats the old mosaic jigsaw. */}
      <StaggerGrid
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 lg:gap-8'
            : 'flex flex-col gap-4'
        }
      >
        {visible.map((listing, index) => (
          <div key={listing.id}>
            <MarketplaceCard
              listing={listing}
              onViewDetails={onViewDetails}
              onToggleFavorite={userPresent ? onToggleFavorite : undefined}
              showFavoriteButton={userPresent}
              searchQuery={searchQuery}
              imageAsset={listingAssets.get(listing.id)}
              priority={index < 8}
            />
          </div>
        ))}
      </StaggerGrid>

      {canLoadMore && (
        <div className="flex items-center justify-center mt-10">
          <Button onClick={onLoadMore} variant="outline" size="lg" disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </>
  );
}

const VALID_SORTS = [
  'boutique',
  'most_loved',
  'best_value',
  'editor_choice',
  'newest',
  'price_asc',
  'price_desc',
] as const;
// Legacy sort tokens are no longer in VALID_SORTS — they get coerced to a
// current token by LEGACY_SORT_MAP before the validity check below.

// Old sort tokens redirect to the closest new sort so existing
// bookmarked URLs and saved searches keep working without 404-ing the UI.
const LEGACY_SORT_MAP: Record<string, MarketplaceSort> = {
  for_you: 'boutique',
  relevance: 'boutique',
  most_viewed: 'most_loved',
  oldest: 'newest',
  az: 'newest',
  za: 'newest',
};
const VIEW_MODE_KEY = 'qg.marketplace.viewMode';
const SHOW_ADULT_KEY = 'qg.marketplace.showAdult';

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

  const rawSort = searchParams.get('sort') || 'boutique';
  const coerced = LEGACY_SORT_MAP[rawSort] ?? rawSort;
  const sortBy: MarketplaceSort = (VALID_SORTS as readonly string[]).includes(coerced)
    ? (coerced as MarketplaceSort)
    : 'boutique';
  const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10) || 0);
  const qParam = searchParams.get('q') || '';

  const [filters, setFilters] = useState<MarketplaceFiltersInput>(() => {
    const init: MarketplaceFiltersInput = {};
    if (qParam) init.search = qParam;
    return init;
  });

  // Default-SFW browse: adult/explicit hidden until an explicit 18+ opt-in.
  // Persisted per-device; turning it on also records the age acknowledgement
  // so the route-level AdultContentGate stays consistent.
  const { acknowledge } = useAdultAcknowledgement();
  const [includeAdult, setIncludeAdult] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SHOW_ADULT_KEY) === '1';
  });
  const handleIncludeAdultChange = (next: boolean) => {
    setIncludeAdult(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SHOW_ADULT_KEY, next ? '1' : '0');
    }
    if (next) acknowledge();
    setUrlParams({ page: undefined });
  };

  const [_selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'grid';
    const stored = window.localStorage.getItem(VIEW_MODE_KEY);
    return stored === 'list' ? 'list' : 'grid';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);
  const [accumulated, setAccumulated] = useState<MarketplaceListing[]>([]);

  const sortOptions = [
    { value: 'boutique', label: 'Featured' },
    { value: 'most_loved', label: 'Most loved' },
    { value: 'best_value', label: 'Best value' },
    { value: 'editor_choice', label: "Editor's choice" },
    { value: 'newest', label: 'Newest first' },
    { value: 'price_asc', label: 'Price: low to high' },
    { value: 'price_desc', label: 'Price: high to low' },
  ];

  const setUrlParams = (updates: Record<string, string | undefined>) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(updates)) {
          if (!v || v === 'all' || v === 'boutique' || v === '0') {
            next.delete(k);
          } else {
            next.set(k, v);
          }
        }
        return next;
      },
      { replace: true },
    );
  };

  // One-tap occasion chip (?occ=occ-pride) rides the tags filter pipeline.
  const occParam = searchParams.get('occ') || '';

  const combinedFilters = useMemo<MarketplaceFiltersInput>(() => {
    const merged = { ...filters };
    if (occParam) merged.tags = [...(merged.tags ?? []), occParam];
    merged.includeAdult = includeAdult;
    return merged;
  }, [filters, includeAdult, occParam]);

  const hasActiveFilters = useMemo(() => {
    const f = combinedFilters;
    return Boolean(
      f.search ||
      f.category ||
      f.department ||
      f.subcategory ||
      f.location ||
      f.businessType ||
      f.priceRange ||
      (f.tags && f.tags.length > 0) ||
      (f.communityOwned && f.communityOwned.length > 0) ||
      f.currency ||
      // `availability: 'in_stock'` is the default — don't count it as an
      // active narrowing. Only the explicit opt-in to sold-out counts.
      f.availability === 'any' ||
      (f.verifiedWithinDays && f.verifiedWithinDays > 0),
    );
  }, [combinedFilters]);

  useEffect(() => {
    fetchListings(combinedFilters, page, sortBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, JSON.stringify(combinedFilters)]);

  useEffect(() => {
    if (page === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
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

  const visibleListingIds = useMemo(() => accumulated.map((l) => l.id), [accumulated]);
  const { assets: listingAssets } = useEntityImageAssets('marketplace_listing', visibleListingIds);

  const hasAdultListings = useMemo(() => accumulated.some(isAdultListing), [accumulated]);

  const handleFiltersChange = (next: Record<string, unknown>) => {
    setFilters(next as MarketplaceFiltersInput);
    const q = (next as MarketplaceFiltersInput).search || '';
    setUrlParams({ q: q || undefined, page: undefined });
  };

  const handleSortChange = (s: string) => {
    setUrlParams({ sort: s === 'boutique' ? undefined : s, page: undefined });
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
        description: favorited
          ? 'You can find this in your favorites list.'
          : 'Item removed from your favorites.',
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

  return (
    <CuratedIdsProvider>
      <div className="min-h-screen relative">
        <PageHero
          eyebrow={t('pages.marketplace.eyebrow', 'Shop')}
          title={t('pages.marketplace.title', 'Marketplace.')}
          lede={t('pages.marketplace.subtitle', 'Queer-friendly products and services.')}
          primaryCta={{
            label: t('pages.marketplace.listBusiness', 'List your business'),
            icon: <Plus size={16} aria-hidden="true" />,
            onClick: () => {
              if (!user) {
                toast({
                  title: 'Sign in required',
                  description: t(
                    'pages.marketplace.signInList',
                    'Create a free account to list your business.',
                  ),
                  variant: 'default',
                });
                navigate('/auth');
                return;
              }
              navigate('/marketplace/submit');
            },
          }}
          size="md"
        />
        <div className="container mx-auto py-8 md:py-12 px-4 relative">
          {/* Decluttered boutique landing: one editorial hero, category
              tiles, one values rail, a guides teaser — then the grid. */}
          {!hasActiveFilters && (
            <>
              <ContinueReadingRail />
              <HeroCollection />
              <MarketplaceCategoryTiles />
              <MarketplaceRow
                rowKey="queer-owned"
                title="Queer-owned picks"
                subtitle="From queer- and trans-owned businesses"
              />
              <div className="mb-10">
                <GuidesStream limit={3} showHero={false} />
                <LocalizedLink
                  to="/marketplace/guides"
                  className="mt-2 inline-flex items-center gap-1 text-13 font-medium hover:underline"
                >
                  All guides
                  <ArrowRight size={14} aria-hidden="true" />
                </LocalizedLink>
              </div>
            </>
          )}

          <div className="mb-6">
            <div className="sticky top-0 z-20 border border-border rounded-element p-4 mb-6 bg-surface-container-low/95 backdrop-blur supports-[backdrop-filter]:bg-surface-container-low/80">
              <div className="mb-4">
                <MarketplaceFilters
                  initialSearch={qParam}
                  onFiltersChange={handleFiltersChange}
                  includeAdult={includeAdult}
                  onIncludeAdultChange={handleIncludeAdultChange}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Occasion chips are a filter — they live with the other
                    filter controls, not as a content section. */}
                {(!hasActiveFilters || occParam) && <OccasionChips className="mb-0" />}

                <div className="ml-auto flex flex-wrap items-center gap-2 sm:gap-4">
                  <SavedSearchesButton />
                  <Select value={sortBy} onValueChange={handleSortChange}>
                    <SelectTrigger
                      className="w-[160px] sm:w-[200px]"
                      aria-label="Sort listings"
                    >
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
                    <Grid size={16} />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                  >
                    <List size={16} />
                  </Button>
                </div>
              </div>
            </div>

            {error && (
              <ErrorState
                message={t(
                  'pages.marketplace.loadError',
                  'Something went wrong while loading the marketplace. Please try again.',
                )}
                onRetry={() => fetchListings(combinedFilters, page, sortBy)}
              />
            )}

            {!error && loading && loadingTimedOut && (
              <LoadingTimeout onRetry={() => fetchListings(combinedFilters, page, sortBy)} />
            )}
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
                    ? buildEmptyTitle(combinedFilters)
                    : t('pages.marketplace.emptyTitle', 'No listings yet.')
                }
                description={
                  hasActiveFilters
                    ? buildLooseningSuggestion(combinedFilters)
                    : t(
                        'pages.marketplace.emptyDescription',
                        'Check back soon or list your business.',
                      )
                }
                mood="neutral"
                primaryAction={
                  hasActiveFilters
                    ? { label: 'Clear filters', onClick: () => handleFiltersChange({}) }
                    : {
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
                      }
                }
              />
            )}

            {!error && accumulated.length > 0 && (
              <MainGridSection
                accumulated={accumulated}
                total={total}
                page={page}
                hasActiveFilters={hasActiveFilters}
                viewMode={viewMode}
                listingAssets={listingAssets}
                searchQuery={filters.search}
                userPresent={!!user}
                onViewDetails={handleViewDetails}
                onToggleFavorite={handleToggleFavorite}
                canLoadMore={canLoadMore}
                loading={loading}
                onLoadMore={handleLoadMore}
              />
            )}
          </div>

          <AffiliateDisclosure />
        </div>
        <AdultContentGate active={hasAdultListings} fallbackPath="/" />
      </div>
    </CuratedIdsProvider>
  );
};
export default Marketplace;
