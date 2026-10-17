import { useReferenceTaxonomy } from './useReferenceTaxonomy';
import { referenceTaxonomyRevision } from '@/lib/referenceTaxonomyStore';
/** Subscribe to the managed browse hierarchy or a specific display vocabulary. */
export function useMarketplaceTaxonomy(kind: 'browse' | 'sizes' | 'occasions' = 'browse') {
  useReferenceTaxonomy(
    kind === 'browse'
      ? 'marketplace_browse'
      : kind === 'sizes'
        ? 'marketplace_size'
        : 'marketplace_occasion',
  );
  return referenceTaxonomyRevision();
}
