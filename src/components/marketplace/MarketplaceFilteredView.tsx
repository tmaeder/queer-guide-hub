import { useEffect, useState } from 'react';
import { useMarketplace, type MarketplaceFiltersInput, type MarketplaceSort } from '@/hooks/useMarketplace';
import { MarketplaceCard } from './MarketplaceCard';
import { AffiliateDisclosure } from './AffiliateDisclosure';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Store } from 'lucide-react';
import { EmptyState, ErrorState, LoadingTimeout } from '@/components/ui/EmptyState';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import type { Database } from '@/integrations/supabase/types';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

interface MarketplaceFilteredViewProps {
  filters: MarketplaceFiltersInput;
  emptyTitle?: string;
  emptyDescription?: string;
}

const SORT_OPTIONS: Array<{ value: MarketplaceSort; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'most_viewed', label: 'Most viewed' },
  { value: 'az', label: 'A–Z' },
  { value: 'za', label: 'Z–A' },
];

export function MarketplaceFilteredView({
  filters,
  emptyTitle = 'No listings yet.',
  emptyDescription = 'Check back soon.',
}: MarketplaceFilteredViewProps) {
  const {
    listings,
    total,
    pageSize,
    loading,
    loadingTimedOut,
    error,
    fetchListings,
  } = useMarketplace();
  const [sortBy, setSortBy] = useState<MarketplaceSort>('newest');
  const [page, setPage] = useState(0);
  const [accumulated, setAccumulated] = useState<MarketplaceListing[]>([]);

  useEffect(() => {
    setPage(0);
    setAccumulated([]);
  }, [JSON.stringify(filters), sortBy]);

  useEffect(() => {
    fetchListings(filters, page, sortBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, JSON.stringify(filters)]);

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

  const totalPages = Math.ceil(total / pageSize);
  const canLoadMore = page < totalPages - 1;

  return (
    <>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <p className="text-muted-foreground">
          {accumulated.length === total
            ? `${total} listing${total !== 1 ? 's' : ''}`
            : `Showing ${accumulated.length} of ${total} listings`}
        </p>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as MarketplaceSort)}>
          <SelectTrigger style={{ width: 200 }} aria-label="Sort listings">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <ErrorState
          message="Something went wrong while loading. Please try again."
          onRetry={() => fetchListings(filters, page, sortBy)}
        />
      )}

      {!error && loading && loadingTimedOut && (
        <LoadingTimeout onRetry={() => fetchListings(filters, page, sortBy)} />
      )}

      {!error && loading && !loadingTimedOut && accumulated.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <MarketplaceCard key={i} loading />
          ))}
        </div>
      )}

      {!error && !loading && accumulated.length === 0 && (
        <EmptyState icon={Store} title={emptyTitle} description={emptyDescription} mood="neutral" />
      )}

      {!error && accumulated.length > 0 && (
        <>
          <StaggerGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6">
            {accumulated.map((listing) => (
              <div key={listing.id}>
                <MarketplaceCard listing={listing} />
              </div>
            ))}
          </StaggerGrid>

          {canLoadMore && (
            <div className="flex items-center justify-center mt-10">
              <Button onClick={() => setPage((p) => p + 1)} variant="outline" size="lg" disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      <AffiliateDisclosure />
    </>
  );
}
