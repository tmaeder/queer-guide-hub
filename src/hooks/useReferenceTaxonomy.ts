import { useEffect, useSyncExternalStore } from 'react';
import { classificationSource, useManagedOptions } from './useManagedOptions';
import {
  observeReferenceTaxonomies,
  referenceTaxonomyRevision,
  replaceReferenceTaxonomy,
  type ReferenceTerm,
} from '@/lib/referenceTaxonomyStore';

/** Subscribe without requiring a QueryClient, including on small reference bands. */
export function useReferenceTaxonomyState(taxonomy?: string) {
  const result = useManagedOptions(
    taxonomy
      ? {
          ...classificationSource(taxonomy),
          extraColumns: ['id', 'parent_id', 'metadata', 'sort_order'],
        }
      : undefined,
  );
  useEffect(() => {
    if (!taxonomy || result.loading || result.error) return;
    const rows: ReferenceTerm[] = result.options.map((option) => ({
      id: String(option.data?.id ?? option.value),
      value: option.value,
      name: option.label,
      is_active: option.active,
      parent_id: typeof option.data?.parent_id === 'string' ? option.data.parent_id : null,
      sort_order: typeof option.data?.sort_order === 'number' ? option.data.sort_order : 0,
      metadata:
        option.data?.metadata &&
        typeof option.data.metadata === 'object' &&
        !Array.isArray(option.data.metadata)
          ? (option.data.metadata as Record<string, unknown>)
          : {},
    }));
    replaceReferenceTaxonomy(taxonomy, rows);
  }, [taxonomy, result.options, result.loading, result.error]);
  const revision = useSyncExternalStore(
    subscribe,
    referenceTaxonomyRevision,
    referenceTaxonomyRevision,
  );
  return { ...result, revision };
}
const subscribe = (changed: () => void) => observeReferenceTaxonomies(() => changed());

export function useReferenceTaxonomy(taxonomy?: string) {
  return useReferenceTaxonomyState(taxonomy).revision;
}
