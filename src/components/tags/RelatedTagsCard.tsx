import { useMemo } from 'react';
import { useSimilarTags, type SimilarTag } from '@/hooks/useTagRelationships';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useSafeMode } from '@/providers/SafeModeProvider';
import { isAdultCategoryName } from '@/components/resources/categoryMeta';

interface RelatedTagsCardProps {
  tagId: string;
  /** Category of the source tag — used to prefer within-category results. */
  sourceCategory?: string | null;
  onTagClick: (tag: { name: string; id: string }) => void;
}

/**
 * Sort related tags: within-category first, then by score descending.
 * When safe mode is on, adult-category tags are stripped entirely.
 */
function rankAndFilter(
  tags: SimilarTag[],
  sourceCategory: string | null | undefined,
  safeEnabled: boolean,
): SimilarTag[] {
  let filtered = tags;

  if (safeEnabled) {
    filtered = filtered.filter((t) => !isAdultCategoryName(t.category));
  }

  if (!sourceCategory) return filtered;

  return [...filtered].sort((a, b) => {
    const aMatch = a.category === sourceCategory ? 1 : 0;
    const bMatch = b.category === sourceCategory ? 1 : 0;
    if (aMatch !== bMatch) return bMatch - aMatch;
    return b.similarity_score - a.similarity_score;
  });
}

export function RelatedTagsCard({ tagId, sourceCategory, onTagClick }: RelatedTagsCardProps) {
  const { data: similarTags, isLoading } = useSimilarTags(tagId, 15);
  const { enabled: safeEnabled } = useSafeMode();

  const ranked = useMemo(
    () => rankAndFilter(similarTags ?? [], sourceCategory, safeEnabled).slice(0, 10),
    [similarTags, sourceCategory, safeEnabled],
  );

  if (isLoading) {
    return (
      <div>
        <h2 className="font-bold text-lg mb-4">Related</h2>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-8 rounded-full" style={{ width: 70 + i * 12 }} />
          ))}
        </div>
      </div>
    );
  }

  if (ranked.length === 0) return null;

  return (
    <div>
      <h2 className="font-bold text-lg mb-4">Related</h2>
      <div className="flex flex-wrap gap-2">
        {ranked.map((tag) => (
          <LocalizedLink
            key={tag.tag_id}
            to={`/resources/${tag.slug || tag.name}`}
            className="no-underline"
            onClick={(e) => {
              e.preventDefault();
              onTagClick({ name: tag.name, id: tag.tag_id });
            }}
          >
            <Badge variant="outline" className="cursor-pointer hover:bg-accent">
              {tag.name}
            </Badge>
          </LocalizedLink>
        ))}
      </div>
    </div>
  );
}
