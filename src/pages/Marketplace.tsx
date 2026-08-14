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
import { MarketplaceControlBar } from '@/components/marketplace/MarketplaceControlBar';
import { MarketplaceLineIndex } from '@/components/marketplace/MarketplaceLineIndex';
import { VerifiedOwnedBrands } from '@/components/marketplace/VerifiedOwnedBrands';
import { OccasionChips } from '@/components/marketplace/OccasionChips';
import { MarketplaceHeroCover } from '@/components/marketplace/MarketplaceHeroCover';
import { BrandSpotlight } from '@/components/marketplace/BrandSpotlight';
import { GuidesRail } from '@/components/guides/GuidesRail';
// ContinueReadingRail was the SECOND thing on this page — a /guides component
// on the shopping surface, IA debris rather than a section. It still lives on
// /guides, where it belongs.
import { AdultContentGate } from '@/components/marketplace/AdultContentGate';
import { isAdultListing, useAdultAcknowledgement } from '@/hooks/useAdultContent';
import { MarketplaceRow } from '@/components/marketplace/MarketplaceRow';
import { AffiliateDisclosure } from '@/components/marketplace/AffiliateDisclosure';
import { CuratedIdsProvider } from '@/components/marketplace/CuratedIdsContext';
import { useCuratedIds } from '@/components/marketplace/useCuratedIds';
import { ZeroResultRescue } from '@/components/marketplace/ZeroResultRescue';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { ErrorState, LoadingTimeout } from '@/components/ui/EmptyState';
import { useDidYouMean } from '@/hooks/useDidYouMean';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { VirtualizedGrid } from '@/components/ui/VirtualizedGrid';
import { useGridColumns } from '@/components/ui/useGridColumns';
import { useTranslation } from 'react-i18next';
import {
  FILTER_PARAM_KEYS,
  filtersToParams,
  hasActiveFilters as hasActiveFiltersFn,
  parseFiltersFromParams,
} from '@/lib/marketplaceFilterParams';
import { PageContainer, STICKY_UNDER_HEADER } from '@/components/layout/PageContainer';

// Must mirror the grid classes' breakpoint column counts (sm/lg/2xl).
const MARKETPLACE_GRID_BREAKPOINTS = [
  { minWidth: 0, columns: 1 },
  { minWidth: 640, columns: 2 },
  { minWidth: 1024, columns: 3 },
  { minWidth: 1536, columns: 4 },
];

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
  canLoadMore,
  loading,
  onLoadMore,
}: MainGridSectionProps) {
  const { ids: curatedIds } = useCuratedIds();
  const visible = useMemo(() => {
    if (page > 0 || hasActiveFilters || curatedIds.size === 0) return accumulated;
    return accumulated.filter((l) => !curatedIds.has(l.id));
  }, [accumulated, page, hasActiveFilters, curatedIds]);
  const gridColumns = useGridColumns(MARKETPLACE_GRID_BREAKPOINTS);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground">
          Showing {visible.length.toLocaleString()} of {total.toLocaleString()} listing
          {total !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Calm uniform grid — editorial rhythm beats the old mosaic jigsaw.
          pb-* on virtual rows preserves the inter-row gap. */}
      <VirtualizedGrid
        items={visible}
        columns={viewMode === 'grid' ? gridColumns : 1}
        rowClassName={
          viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 lg:gap-8 pb-6 lg:pb-8'
            : 'flex flex-col gap-4 pb-4'
        }
        estimateRowHeight={viewMode === 'grid' ? 520 : 180}
        itemKey={(listing) => listing.id}
        renderItem={(listing, index) => (
          <MarketplaceCard
            listing={listing}
            showFavoriteButton={userPresent}
            searchQuery={searchQuery}
            imageAsset={listingAssets.get(listing.id)}
            priority={index < 8}
            variant={viewMode === 'list' ? 'row' : 'grid'}
          />
        )}
      />

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
    // `toggleFavorite` / `incrementViews` are intentionally not pulled in here:
    // the handlers that used them were unreachable (see the note further down).
    // They remain on the hook for MarketplaceItemDetail, which does call them.
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

  // The URL is the single source of truth for filters — shareable,
  // bookmarkable, and saved searches capture the full set.
  const filters = useMemo(() => parseFiltersFromParams(searchParams), [searchParams]);

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

  const hasActiveFilters = useMemo(() => hasActiveFiltersFn(combinedFilters), [combinedFilters]);

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

  // Zero-result typo recovery for the empty state.
  const dymHit = useDidYouMean(
    filters.search ?? '',
    !loading && !error && accumulated.length === 0 && Boolean(filters.search),
  );

  const handleFiltersChange = (next: MarketplaceFiltersInput) => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        for (const k of FILTER_PARAM_KEYS) sp.delete(k);
        for (const [k, v] of Object.entries(filtersToParams(next))) {
          if (v) sp.set(k, v);
        }
        sp.delete('page');
        return sp;
      },
      { replace: true },
    );
  };

  const handleClearAll = () => {
    setSearchParams(
      (prev) => {
        const sp = new URLSearchParams(prev);
        for (const k of FILTER_PARAM_KEYS) sp.delete(k);
        sp.delete('occ');
        sp.delete('page');
        return sp;
      },
      { replace: true },
    );
  };

  const handleSortChange = (s: string) => {
    setUrlParams({ sort: s === 'boutique' ? undefined : s, page: undefined });
  };

  const handleLoadMore = () => {
    setUrlParams({ page: String(page + 1) });
  };

  // `handleToggleFavorite` and `handleViewDetails` lived here — 23 lines of
  // auth check, toast and refetch, plus an `incrementViews` call — and were
  // passed to MarketplaceCard as props the card DECLARED but never
  // destructured. Neither could ever fire, and `_selectedListing` was written
  // and never read. Favoriting is <WishlistPicker/>'s job; the whole card is a
  // link to the detail page, which is where a view is counted. Deleted rather
  // than wired up, because wiring them would have changed live behaviour under
  // cover of a design change.

  const totalPages = Math.ceil(total / pageSize);
  const canLoadMore = page < totalPages - 1;

  const handleListBusiness = () => {
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
    // `/marketplace/submit` was never a declared route — it fell through to
    // `marketplace/:slug` and rendered a not-found listing. `/submit/product`
    // is the real form (submissionRegistry `productSubmission`), and it is
    // already what src/lib/submitCta.ts resolves for `/marketplace*`, so the
    // two paths now agree.
    navigate('/submit/product');
  };

  return (
    <CuratedIdsProvider>
      {/* THE M LINE.
          The landing is the line map; filtering is riding it. What that buys is
          one rule: nothing which is NAVIGATION may disappear when you start
          riding. Before this, seven blocks were gated on `!hasActiveFilters` —
          and `hasActiveFilters` includes `?occ=`, so tapping an occasion chip
          INSIDE the control bar deleted ~4000px above it and threw the bar up
          the document under the reader's finger. The scroll length was never
          the defect; the persistent chrome moving was.

          Masthead, control band and department index now render in every
          state. Exactly ONE band still flips: the cover story, because a
          magazine cover above someone's search results is noise. The editorial
          tail moved BELOW the grid, where it is an ending rather than a wall,
          and none of it was ever filter-dependent — each block runs its own
          query and self-hides when empty. */}
      <div className="min-h-screen relative">
        <header className="border-b-4 border-foreground">
          <PageContainer flush className="pb-8 pt-8 md:pb-12 md:pt-16">
            <div className="flex items-center gap-4">
              <RouteBullet type="marketplace" size={44} />
              <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                Marketplace · Yellow line
              </p>
            </div>
            {/* `text-hero` flat, no md:text-hero-xl — that rank is for
                marketing covers, not a listing index. */}
            <h1 className="mt-4 font-display text-hero leading-[0.95]">
              {t('pages.marketplace.title', 'Marketplace.')}
            </h1>
            <p className="mt-4 max-w-reading text-body-lg">
              {t('pages.marketplace.subtitle', 'Queer-friendly products and services.')}
            </p>
            {/* The one place on the page that names the line. A track colour
                has to earn its appearance; everywhere else this page is ink on
                paper. Border-gated by the ink rule beside it.

                RENDERED UNCONDITIONALLY, and that is the point. This was
                `{total > 0 && …}`, so filtering down to zero results unmounted
                a whole masthead row and shifted the control band up — the exact
                thing the rest of this page is built to prevent, reintroduced
                three elements above the band itself. The anti-flip e2e test
                caught it in CI (it passed locally only because the filter I
                measured happened to return rows). A row that reserves its space
                and reads "0 listings in view" is both honest and stable. */}
            <p className="mt-6 flex items-center gap-4 text-13 text-muted-foreground">
              <span
                aria-hidden="true"
                className="h-1.5 w-10 shrink-0 border border-foreground bg-track-yellow"
              />
              <span className="tabular-nums">
                {loading && total === 0
                  ? 'Counting…'
                  : `${total.toLocaleString()} listing${total !== 1 ? 's' : ''} in view`}
              </span>
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button onClick={handleListBusiness}>
                <Plus size={16} aria-hidden="true" />
                {t('pages.marketplace.listBusiness', 'List your business')}
              </Button>
            </div>
            {/* Disclosure BEFORE the monetised links, not after an infinite
                grid — which is where the full statement used to sit alone. */}
            <AffiliateDisclosure variant="strip" className="mt-8" />
          </PageContainer>
        </header>

        {/* A band, not an island. The control bar used to be a floating
            bordered box inside the content column; bands are the page's
            grammar and a band cannot be scrolled past without being noticed. */}
        <section
          className={`sticky ${STICKY_UNDER_HEADER} z-20 border-b-4 border-foreground bg-surface-container-low`}
        >
          <PageContainer flush className="py-4 md:py-6">
            <MarketplaceControlBar
              filters={filters}
              onFiltersChange={handleFiltersChange}
              sortBy={sortBy}
              sortOptions={sortOptions}
              onSortChange={handleSortChange}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              includeAdult={includeAdult}
              onIncludeAdultChange={handleIncludeAdultChange}
              resultCount={total}
              onClearAll={handleClearAll}
            />
          </PageContainer>
        </section>

        {/* Band wrappers are `div`, not `section`: each already contains a
            component that renders its own labelled <section>, and an outer
            <section> with no accessible name only adds a hollow region. */}
        <div className="border-b-4 border-foreground">
          <PageContainer flush className="py-8 md:py-12">
            {/* `department` is a single slug, not an array — indexing it would
                mark the station whose slug starts with that letter. */}
            <MarketplaceLineIndex activeDepartment={filters.department} />
          </PageContainer>
        </div>

        {!hasActiveFilters && (
          <div className="border-b-4 border-foreground">
            <PageContainer flush className="py-8 md:py-12">
              <MarketplaceHeroCover />
            </PageContainer>
          </div>
        )}

        <PageContainer className="relative">
          <div className="mb-6">
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
              <ZeroResultRescue
                filters={filters}
                onFiltersChange={handleFiltersChange}
                didYouMean={dymHit?.title}
                onClear={handleClearAll}
                onListBusiness={handleListBusiness}
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
                canLoadMore={canLoadMore}
                loading={loading}
                onLoadMore={handleLoadMore}
              />
            )}
          </div>
        </PageContainer>

        {/* ALSO ON THIS LINE — the editorial tail.
            These sat ABOVE the grid and vanished with any filter. Nothing here
            depends on the filter state (each block runs its own query), so
            gating them only ever cost the reader the page. Below the grid they
            are an ending. Each self-hides when it has nothing. */}
        <div className="border-t-4 border-foreground">
          <PageContainer flush className="flex flex-col gap-16 py-12 md:gap-24 md:py-16">
            <VerifiedOwnedBrands />
            <BrandSpotlight />
            <MarketplaceRow rowKey="new" title="New this week" />
            {/* Editor-curated collection chips; occasion toggles live in the
                control band. */}
            <OccasionChips kinds={['collection']} />
            {/* `alwaysRender` is load-bearing, not a preference. With /shop
                folded in, /marketplace is the `shop` cluster hub, and the
                desktop header is the Intent Router — no destination links — so
                this is the ONLY path from desktop chrome into the guides
                family. #2723 fixed a nightly that failed for days because
                nothing linked /guides at all; letting this rail self-hide on a
                thin query would re-orphan it. Guarded by
                "the shop hub links to the guides family" in e2e/guides.spec.ts. */}
            <GuidesRail filters={{ entityType: 'marketplace', limit: 3 }} alwaysRender />
            <AffiliateDisclosure />
          </PageContainer>
        </div>

        <AdultContentGate active={hasAdultListings} fallbackPath="/" />
      </div>
    </CuratedIdsProvider>
  );
};
export default Marketplace;
