import type { SearchFilters } from '@/hooks/useSearch';

function numberParam(params: URLSearchParams, key: string): number | undefined {
  const value = params.get(key);
  if (value == null || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function readSearchFilters(params: URLSearchParams): SearchFilters {
  const list = (key: string) => params.get(key)?.split(',').filter(Boolean);
  const min = numberParam(params, 'price_min');
  const max = numberParam(params, 'price_max');
  const from = new Date(params.get('date_from') || '');
  const to = new Date(params.get('date_to') || '');
  return {
    types: list('types') || [],
    location: params.get('location') || undefined,
    categories: list('categories'),
    cluster_ids: list('clusters'),
    tags: list('tags'),
    target_groups: list('target_groups'),
    lat: numberParam(params, 'lat'),
    lng: numberParam(params, 'lng'),
    radius: numberParam(params, 'radius'),
    priceRange: min != null && max != null && min <= max ? [min, max] : undefined,
    dateRange:
      Number.isFinite(from.getTime()) && Number.isFinite(to.getTime()) && from <= to
        ? [from, to]
        : undefined,
    free: params.get('free') === 'true' || undefined,
    featured: params.get('featured') === 'true' || undefined,
  };
}

export function writeSearchFilters(
  query: string,
  filters: SearchFilters,
  sort: string,
): URLSearchParams {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  const lists = {
    types: filters.types,
    categories: filters.categories,
    clusters: filters.cluster_ids,
    tags: filters.tags,
    target_groups: filters.target_groups,
  };
  for (const [key, values] of Object.entries(lists))
    if (values?.length) params.set(key, values.join(','));
  if (filters.location) params.set('location', filters.location);
  if (filters.lat != null && filters.lng != null) {
    params.set('lat', String(filters.lat));
    params.set('lng', String(filters.lng));
    if (filters.radius != null) params.set('radius', String(filters.radius));
  }
  if (filters.priceRange) {
    params.set('price_min', String(filters.priceRange[0]));
    params.set('price_max', String(filters.priceRange[1]));
  }
  if (filters.dateRange) {
    params.set('date_from', filters.dateRange[0].toISOString());
    params.set('date_to', filters.dateRange[1].toISOString());
  }
  if (filters.free) params.set('free', 'true');
  if (filters.featured) params.set('featured', 'true');
  if (sort !== 'relevance') params.set('sort', sort);
  return params;
}
