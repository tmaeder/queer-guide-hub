import { useEffect, useMemo } from 'react';
import { MarketplaceCard } from './MarketplaceCard';
import { useMarketplace, type MarketplaceFiltersInput } from '@/hooks/useMarketplace';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { FilterChip } from '@/components/transit/FilterChip';
import { Button } from '@/components/ui/button';
import { DeadEndTrack } from '@/components/transit/DeadEndTrack';
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

const SECTION_LABEL = 'text-13 font-bold uppercase tracking-label text-muted-foreground';

/**
 * Zero-result state that rescues instead of dead-ending: one-tap
 * relax-a-filter chips plus the closest matches with facets stripped
 * (search term kept).
 *
 * The illustrated `EmptyState` this replaced brought a lucide storefront inside
 * a rounded halo onto a page that is otherwise TransitIcon-only and has a zero
 * radius — and its "loosen" chips were bare hover-tinted text, not chips. The
 * line simply ends here, so the artwork is `DeadEndTrack`: the same device
 * /404 uses, which is what a filtered-to-nothing marketplace actually is.
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
      <div>
        <h2 className="font-display text-headline leading-tight">
          {active ? buildEmptyTitle(filters) : 'No listings yet.'}
        </h2>
        <p className="mt-2 max-w-reading text-muted-foreground">
          {active
            ? buildLooseningSuggestion(filters)
            : 'Nothing is listed on this line right now.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {didYouMean && (
            <Button
              variant="outline"
              onClick={() => onFiltersChange({ ...filters, search: didYouMean })}
            >
              Did you mean “{didYouMean}”?
            </Button>
          )}
          {active ? (
            <Button onClick={onClear}>Clear filters</Button>
          ) : (
            <Button onClick={onListBusiness}>List your business</Button>
          )}
        </div>
      </div>

      <DeadEndTrack label={active ? 'Filtered out' : 'No service'} type="marketplace" />

      {steps.length > 0 && (
        <div className="flex flex-col gap-4">
          <p className={SECTION_LABEL}>Loosen one filter</p>
          <div className="flex flex-wrap gap-2">
            {steps.map((s) => (
              <FilterChip
                key={s.label}
                active={false}
                label={s.label}
                onClick={() => onFiltersChange(s.next)}
              />
            ))}
          </div>
        </div>
      )}

      {hasFacetsBeyondSearch && nearestFour.length > 0 && (
        <section aria-labelledby="nearest-matches">
          <h2 id="nearest-matches" className={`mb-4 ${SECTION_LABEL}`}>
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
