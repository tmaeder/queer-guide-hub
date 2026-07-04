import { useEffect, useMemo } from 'react';
import { Store } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { MarketplaceCard } from './MarketplaceCard';
import { useMarketplace, type MarketplaceFiltersInput } from '@/hooks/useMarketplace';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import {
  buildEmptyTitle,
  buildLooseningSuggestion,
  buildRelaxationSteps,
} from './marketplaceEmptyState';
import { countActiveFilters } from '@/lib/marketplaceFilterParams';

interface ZeroResultRescueProps {
  filters: MarketplaceFiltersInput;
  onFiltersChange: (next: MarketplaceFiltersInput) => void;
  /** "Did you mean" typo suggestion from useDidYouMean, if any. */
  didYouMean?: string;
  onClear: () => void;
  onListBusiness: () => void;
}

/**
 * Zero-result state that rescues instead of dead-ending: one-tap
 * relax-a-filter chips plus the closest matches with facets stripped
 * (search term kept).
 */
export function ZeroResultRescue({
  filters,
  onFiltersChange,
  didYouMean,
  onClear,
  onListBusiness,
}: ZeroResultRescueProps) {
  const active = countActiveFilters(filters) > 0;
  const steps = useMemo(() => buildRelaxationSteps(filters), [filters]);

  // Closest matches: same search, facets stripped. Only worth fetching
  // when a facet was actually narrowing the result set.
  const hasFacetsBeyondSearch = steps.length > 0;
  const { listings: nearest, fetchListings } = useMarketplace();
  useEffect(() => {
    if (!hasFacetsBeyondSearch) return;
    const bare: MarketplaceFiltersInput = {
      search: filters.search,
      includeAdult: filters.includeAdult,
    };
    fetchListings(bare, 0, 'boutique');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFacetsBeyondSearch, filters.search, filters.includeAdult]);
  const nearestFour = nearest.slice(0, 4);
  const nearestIds = useMemo(() => nearestFour.map((l) => l.id), [nearestFour]);
  const { assets } = useEntityImageAssets('marketplace_listing', nearestIds);

  return (
    <div className="flex flex-col gap-10">
      <EmptyState
        icon={Store}
        title={active ? buildEmptyTitle(filters) : 'No listings yet.'}
        description={
          active ? buildLooseningSuggestion(filters) : 'Check back soon or list your business.'
        }
        mood="neutral"
        secondaryAction={
          didYouMean
            ? {
                label: `Did you mean “${didYouMean}”?`,
                onClick: () => onFiltersChange({ ...filters, search: didYouMean }),
              }
            : undefined
        }
        primaryAction={
          active
            ? { label: 'Clear filters', onClick: onClear }
            : { label: 'List Your Business', onClick: onListBusiness }
        }
      />

      {steps.length > 0 && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-2xs uppercase tracking-wider text-muted-foreground">
            Loosen one filter
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {steps.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => onFiltersChange(s.next)}
                className="rounded-badge border border-border px-2 py-1 text-13 transition-colors hover:bg-muted"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {hasFacetsBeyondSearch && nearestFour.length > 0 && (
        <section aria-labelledby="nearest-matches">
          <h2
            id="nearest-matches"
            className="mb-4 text-2xs uppercase tracking-wider text-muted-foreground"
          >
            Closest matches without your filters
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {nearestFour.map((l) => (
              <MarketplaceCard key={l.id} listing={l} imageAsset={assets.get(l.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
