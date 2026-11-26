import type { SearchFilters } from '@/hooks/useSearch';

/** How many advanced filters are set (scope not counted). */
export function countActiveFilters(f: SearchFilters): number {
  return (
    (f.dateRange ? 1 : 0) +
    (f.priceRange ? 1 : 0) +
    (f.location || (f.lat != null && f.lng != null) ? 1 : 0) +
    (f.free ? 1 : 0) +
    (f.featured ? 1 : 0) +
    (f.target_groups?.length ?? 0) +
    (f.tags?.length ?? 0) +
    (f.categories?.length ?? 0) +
    (f.cluster_ids?.length ?? 0)
  );
}
