/**
 * Ranking for the computed similarity pool (`get_similar_tags`).
 *
 * Pure, so it can be tested without mounting anything. It was inline in
 * RelatedTagsCard; the tag detail page now renders the pool inside its
 * end-of-line panel rather than as a sidebar card, and the ranking is the only
 * part of that component worth keeping.
 *
 * Two rules, in order: safe mode drops adult tags outright, then tags sharing
 * the source tag's category float above the rest. Same-category first matters
 * because the pool is embedding-derived and will happily rank a term from a
 * completely different part of the taxonomy above a close sibling.
 */

import type { SimilarTag } from '@/hooks/useTagRelationships';
import { isAdultTag } from '@/components/resources/categoryMeta';

export function rankSimilarTags(
  tags: SimilarTag[],
  sourceCategory: string | null | undefined,
  safeEnabled: boolean,
): SimilarTag[] {
  let filtered = tags;

  if (safeEnabled) {
    filtered = filtered.filter((t) => !isAdultTag(t));
  }

  if (!sourceCategory) return filtered;

  return [...filtered].sort((a, b) => {
    const aMatch = a.category === sourceCategory ? 1 : 0;
    const bMatch = b.category === sourceCategory ? 1 : 0;
    if (aMatch !== bMatch) return bMatch - aMatch;
    return b.similarity_score - a.similarity_score;
  });
}
