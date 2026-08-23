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
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { ErrorState, LoadingTimeout } from '@/components/ui/EmptyState';
import { useDidYouMean } from '@/hooks/useDidYouMean';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { MarketplaceMasthead } from '@/components/marketplace/MarketplaceMasthead';
import { LoadMore } from '@/components/transit/LoadMore';
import { VirtualizedGrid } from '@/components/ui/VirtualizedGrid';
import { useGridColumns } from '@/components/ui/useGridColumns';
import { useTranslation } from 'react-i18next';
import {
  FILTER_PARAM_KEYS,
  filtersToParams,
  hasActiveFilters as hasActiveFiltersFn,
  isAttributeTag,
  parseFiltersFromParams,
} from '@/lib/marketplaceFilterParams';
import { FromTheGlossary } from '@/components/tags/FromTheGlossary';
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
      {/* Same swatch + tabular figure as the masthead and every sub-page's
          count, so "how big is this set" is stated one way everywhere. */}
      <p className="mb-6 flex items-center gap-4 text-13 text-muted-foreground">
        <span
          aria-hidden="true"
          className="h-1.5 w-10 shrink-0 border border-border-hairline bg-track-yellow"
        />
        <span className="tabular-nums">
          {visible.length.toLocaleString()} of {total.toLocaleString()} listing
          {total !== 1 ? 's' : ''}
        </span>
      </p>

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

      {/* autoLoadLimit={0} — this grid is virtualized and the hub is a browse
          surface, so scroll-to-load would keep fetching while the reader is
          only skimming. The button stays the sole trigger, as it was. */}
      <LoadMore hasMore={canLoadMore} loading={loading} onLoadMore={onLoadMore} autoLoadLimit={0} />
    </>
  );
}

/**
 * End of line: the hub's one ink block, and the makers directory's entry point.
 *
 * `/marketplace/brands` did not exist until now, and the brand pages it indexes
 * were reachable only from links inside cards and spotlight blocks. A hub that
 * lists 2,500 makers and offers no way to see them as a set was the gap.
 */
function MakersEntry() {
  return (
    <section aria-labelledby="makers-entry" className="bg-foreground p-6 text-background md:p-8">
      <p className="text-2xs font-bold uppercase tracking-label text-background/70">End of line</p>
      <h2 id="makers-entry" className="mt-1 font-display text-headline leading-tight">
        Every maker on this line
      </h2>
      <p className="mt-2 max-w-reading text-15 text-background/85">
        Browse brands by name, or filter to the ones whose ownership we have recorded.
      </p>
      <LocalizedLink
        to="/marketplace/brands"
        className="border mt-4 inline-flex items-center gap-2 border-background px-4 py-2 text-13 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground"
      >
        All makers →
      </LocalizedLink>
    </section>
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

  // Exactly one active CONCEPT tag (non-attribute) → the glossary teaser slug.
  const conceptTeaserTag = useMemo(() => {
    const concepts = (combinedFilters.tags ?? []).filter((t) => !isAttributeTag(t));
    return concepts.length === 1 ? concepts[0] : null;
  }, [combinedFilters.tags]);

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

          NOTHING ABOVE THE RESULTS FLIPS ANY MORE. The cover story was the
          last block still gated on `!hasActiveFilters`; it has joined the
          editorial tail below the grid, where it can render unconditionally
          because a magazine cover is only noise when it sits ABOVE someone's
          search results. So the region from masthead to control band is now
          byte-identical in every filter state, and the tail is an ending
          rather than a wall — each of its blocks runs its own query and
          self-hides when empty.

          Order is deliberate: masthead → stop list → control band → results.
          The stop list is what you navigate WITH, the control band is what you
          refine with and the thing that must survive scrolling, so it is the
          last stationary band before the grid and sticks from there on. */}
      <div className="min-h-screen relative">
        <MarketplaceMasthead
          eyebrow="Marketplace · Yellow line"
          title={t('pages.marketplace.title', 'Marketplace.')}
          lede={t('pages.marketplace.subtitle', 'Queer-friendly products and services.')}
          count={
            loading && total === 0
              ? 'Counting…'
              : `${total.toLocaleString()} listing${total !== 1 ? 's' : ''} in view`
          }
          actions={
            <>
              <Button onClick={handleListBusiness}>
                {t('pages.marketplace.listBusiness', 'List your business')}
              </Button>
              <Button variant="outline" asChild>
                <LocalizedLink to="/marketplace/brands" className="no-underline">
                  {t('marketplace.allMakers', 'All makers')}
                </LocalizedLink>
              </Button>
            </>
          }
        >
          {/* Disclosure BEFORE the monetised links, not after an infinite
              grid — which is where the full statement used to sit alone. */}
          <AffiliateDisclosure variant="strip" className="mt-8" />
        </MarketplaceMasthead>

        {/* Band wrappers are `div`, not `section`: each already contains a
            component that renders its own labelled <section>, and an outer
            <section> with no accessible name only adds a hollow region.

            THE STOP LIST NOW PRECEDES THE CONTROL BAND. The line map is what
            you navigate with; the control bar is what you refine with, and it
            is the thing that has to still be there after you scroll — so it is
            the last stationary band before the results and sticks directly
            under the header from then on. */}
        <div className="border-b border-border-hairline">
          <PageContainer flush className="py-8 md:py-12">
            {/* `department` is a single slug, not an array — indexing it would
                mark the station whose slug starts with that letter. */}
            <MarketplaceLineIndex activeDepartment={filters.department} />
          </PageContainer>
        </div>

        {/* A band, not an island. The control bar used to be a floating
            bordered box inside the content column; bands are the page's
            grammar and a band cannot be scrolled past without being noticed. */}
        <section
          className={`sticky ${STICKY_UNDER_HEADER} z-20 border-b border-border-hairline bg-surface-container-low`}
        >
          {/* py-2 below md: this band is sticky, so its padding is subtracted from
              every screen of results. Measured 260px total chrome at 390x844 —
              31% of the viewport, worse than /cities before its fix. */}
          <PageContainer flush className="py-2 md:py-6">
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

        <PageContainer className="relative">
          {/* "About this tag" — the browse ↔ glossary round-trip. Renders only
              when exactly ONE non-attribute (concept) tag is active: an
              attribute like mat-cotton has no wiki entry, and two concepts
              would make the teaser ambiguous. Self-hiding when the tag has no
              glossary definition. */}
          {conceptTeaserTag && (
            <FromTheGlossary tags={[conceptTeaserTag]} max={1} className="mb-6" />
          )}
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
            are an ending. Each self-hides when it has nothing.

            THE COVER STORY JOINED THEM, and that is what finally kills the
            two-mode page. It was the last block still gated on
            `!hasActiveFilters` — a reasonable gate in its old position (a
            magazine cover above someone's search results is noise) but the gate
            was only needed BECAUSE the cover sat above the grid. Down here it
            is editorial among editorial, so it can render unconditionally and
            the entire region above the results is now stable in every state. */}
        <div className="border-t border-border-hairline">
          <PageContainer flush className="flex flex-col gap-16 py-12 md:gap-24 md:py-16">
            <MarketplaceRow rowKey="new" title="New this week" />
            <MarketplaceHeroCover />
            {/* The makers directory's entry point from the hub. Without a link
                here the new /marketplace/brands index is reachable only by
                typing it — the whole reason it was worth building is that brand
                pages were previously buried inside cards. */}
            <VerifiedOwnedBrands />
            <BrandSpotlight />
            <MakersEntry />
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
