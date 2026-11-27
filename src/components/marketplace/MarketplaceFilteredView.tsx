import { TransitIcon } from '@/components/transit/TransitIcon';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useMarketplace,
  type MarketplaceFiltersInput,
  type MarketplaceSort,
} from '@/hooks/useMarketplace';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { MarketplaceCard } from './MarketplaceCard';
import { AffiliateDisclosure } from './AffiliateDisclosure';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingTimeout } from '@/components/ui/EmptyState';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { Database } from '@/integrations/supabase/types';
import type { MarketplaceSurface } from '@/lib/affiliate/marketplace';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

interface MarketplaceFilteredViewProps {
  filters: MarketplaceFiltersInput;
  emptyTitle?: string;
  /** Where the reader should go instead. Rendered as one inline link. */
  emptyAction?: { label: string; to: string };
  /** Attribution surface passed through to the cards' outbound /go links. */
  surface?: MarketplaceSurface;
}

const GRID_CLASSES =
  'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6';

/**
 * The listing engine behind every secondary marketplace page — maker, merchant,
 * category, collection.
 *
 * Its chrome used to be generic shadcn (a `Select` sized by an inline style, an
 * illustrated `EmptyState` with a rounded icon halo) with every string
 * hard-coded in English. Because four pages share this one file, that meant
 * four pages were simultaneously off the design system and untranslated. The
 * sort control now matches the one in `MarketplaceControlBar` exactly, so the
 * hub and its sub-pages read as the same instrument.
 */
export function MarketplaceFilteredView({
  filters,
  emptyTitle,
  emptyAction,
  surface = 'marketplace_grid',
}: MarketplaceFilteredViewProps) {
  const { t } = useTranslation();
  const { listings, total, pageSize, loading, loadingTimedOut, error, fetchListings } =
    useMarketplace();
  const [sortBy, setSortBy] = useState<MarketplaceSort>('newest');
  const [page, setPage] = useState(0);
  const [accumulated, setAccumulated] = useState<MarketplaceListing[]>([]);

  // Built inside the component: these are translated, so they cannot be a
  // module constant evaluated before i18n has a language.
  //
  // Only sorts whose label states what they do. "Editor's choice" and "Best
  // value" were removed here: both ordered by `quality_score` (a data
  // completeness score — no editor chose anything, and nothing measured
  // value), so the labels promised a judgement the data does not hold. "Most
  // loved" ordered by views, so it now says that.
  const sortOptions: Array<{ value: MarketplaceSort; label: string }> = [
    { value: 'newest', label: t('marketplace.sort.newest', 'Newest first') },
    { value: 'most_loved', label: t('marketplace.sort.mostViewed', 'Most viewed') },
    { value: 'price_asc', label: t('marketplace.sort.priceAsc', 'Price: low to high') },
    { value: 'price_desc', label: t('marketplace.sort.priceDesc', 'Price: high to low') },
  ];

  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setPage(0);
    setAccumulated([]);
  }, [filtersKey, sortBy]);

  useEffect(() => {
    fetchListings(filters, page, sortBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, JSON.stringify(filters)]);

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

  const listingIds = useMemo(() => accumulated.map((l) => l.id), [accumulated]);
  const { assets } = useEntityImageAssets('marketplace_listing', listingIds, accumulated);

  const totalPages = Math.ceil(total / pageSize);
  const canLoadMore = page < totalPages - 1;

  return (
    <>
      {/* Result count + the current sort IN WORDS. The sort used to be an
          icon with the order hidden in a tooltip, so a reader could not tell
          what decided which products came first. The native select sits
          invisibly over the whole control. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-13 text-muted-foreground tabular-nums" aria-live="polite">
          {!loading || accumulated.length > 0
            ? t('marketplace.resultCount', '{{n}} listings', {
                count: total,
                n: total.toLocaleString(),
                defaultValue_one: '{{n}} listing',
              })
            : ''}
        </p>
        <span className="relative inline-flex h-11 items-center gap-2 rounded-element bg-card px-4 text-13 font-bold shadow-soft hover:bg-foreground hover:text-background">
          <TransitIcon name="sort" size={18} aria-hidden />
          <span aria-hidden="true">{sortOptions.find((o) => o.value === sortBy)?.label}</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as MarketplaceSort)}
            aria-label={t('marketplace.sortLabel', 'Sort listings')}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </span>
      </div>

      {error && (
        <ErrorState
          message={t(
            'marketplace.loadError',
            'Something went wrong while loading. Please try again.',
          )}
          onRetry={() => fetchListings(filters, page, sortBy)}
        />
      )}

      {!error && loading && loadingTimedOut && (
        <LoadingTimeout onRetry={() => fetchListings(filters, page, sortBy)} />
      )}

      {!error && loading && !loadingTimedOut && accumulated.length === 0 && (
        <div className={GRID_CLASSES}>
          {Array.from({ length: 6 }).map((_, i) => (
            <MarketplaceCard key={i} loading />
          ))}
        </div>
      )}

      {/* One honest sentence and one way onward. The illustrated empty state
          this replaced was a lucide storefront in a rounded halo — two shapes
          the design system does not have. */}
      {!error && !loading && accumulated.length === 0 && (
        <p className="text-muted-foreground">
          {emptyTitle ?? t('marketplace.empty', 'No listings here yet.')}{' '}
          {emptyAction && (
            <LocalizedLink to={emptyAction.to} className="underline underline-offset-4">
              {emptyAction.label}
            </LocalizedLink>
          )}
        </p>
      )}

      {!error && accumulated.length > 0 && (
        <>
          <StaggerGrid className={GRID_CLASSES}>
            {accumulated.map((listing, index) => (
              <div key={listing.id}>
                <MarketplaceCard
                  listing={listing}
                  imageAsset={assets.get(listing.id)}
                  priority={index < 8}
                  surface={surface}
                />
              </div>
            ))}
          </StaggerGrid>

          {canLoadMore && (
            <div className="mt-10 flex items-center justify-center">
              <Button
                onClick={() => setPage((p) => p + 1)}
                variant="outline"
                size="lg"
                loading={loading}
              >
                {t('common.loadMore', 'Load more')}
              </Button>
            </div>
          )}
        </>
      )}

      <AffiliateDisclosure />
    </>
  );
}
