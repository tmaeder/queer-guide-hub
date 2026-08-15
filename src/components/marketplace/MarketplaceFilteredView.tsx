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
  const sortOptions: Array<{ value: MarketplaceSort; label: string }> = [
    { value: 'newest', label: t('marketplace.sort.newest', 'Newest first') },
    { value: 'most_loved', label: t('marketplace.sort.mostLoved', 'Most loved') },
    { value: 'best_value', label: t('marketplace.sort.bestValue', 'Best value') },
    { value: 'editor_choice', label: t('marketplace.sort.editorChoice', "Editor's choice") },
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
  const { assets } = useEntityImageAssets('marketplace_listing', listingIds);

  const totalPages = Math.ceil(total / pageSize);
  const canLoadMore = page < totalPages - 1;

  return (
    <>
      {/* Same swatch + tabular count as the masthead, so a sub-page states its
          size the way the hub does. Rendered in every state for the same
          anti-flip reason the masthead row is. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="flex items-center gap-4 text-13 text-muted-foreground">
          <span
            aria-hidden="true"
            className="h-1.5 w-10 shrink-0 border border-foreground bg-track-yellow"
          />
          <span className="tabular-nums">
            {t('marketplace.showingCount', {
              defaultValue: '{{shown}} of {{total}} listings',
              shown: accumulated.length.toLocaleString(),
              total: total.toLocaleString(),
            })}
          </span>
        </p>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as MarketplaceSort)}
          aria-label={t('marketplace.sortLabel', 'Sort listings')}
          className="h-8 border-2 border-foreground bg-background px-2 text-13 font-bold"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
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
