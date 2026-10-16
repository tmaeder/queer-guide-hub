import { useMemo } from 'react';
import { useManagedOptions } from './useManagedOptions';
export interface AmenityTerm {
  slug: string;
  name: string;
  icon_name: string | null;
  kind: 'amenity' | 'accessibility' | 'queer';
  category_scope: string[];
}
/** Shared managed cache responds to CMS edits without requiring a page reload. */
export function useAmenityVocabulary() {
  const result = useManagedOptions({
    table: 'amenities',
    valueColumn: 'slug',
    labelColumn: 'name',
    activeColumn: 'is_active',
    orderBy: 'sort_order',
    extraColumns: ['icon_name', 'kind', 'category_scope'],
  });
  const vocab = useMemo(() => {
    if (!result.hasData) return null;
    const terms = new Map<string, AmenityTerm>();
    for (const option of result.options) {
      if (!option.active) continue;
      const data = option.data ?? {};
      const kind = data.kind === 'accessibility' || data.kind === 'queer' ? data.kind : 'amenity';
      terms.set(option.value, {
        slug: option.value,
        name: option.label,
        icon_name: typeof data.icon_name === 'string' ? data.icon_name : null,
        kind,
        category_scope: Array.isArray(data.category_scope)
          ? data.category_scope.filter((value): value is string => typeof value === 'string')
          : ['all'],
      });
    }
    return terms;
  }, [result.options, result.hasData]);
  return { vocab, loading: result.loading, error: result.error, retry: result.retry };
}
