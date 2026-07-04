import { useMemo } from 'react';
import { useSimilarTags, type SimilarTag } from '@/hooks/useTagRelationships';
import { Skeleton } from '@/components/ui/skeleton';
import { TagChip } from '@/components/tags/TagChip';
import { useSafeMode } from '@/providers/SafeModeProvider';
import { isAdultCategoryName } from '@/components/resources/categoryMeta';
import { useTranslation } from 'react-i18next';

interface RelatedTagsCardProps {
  tagId: string;
  sourceCategory?: string | null;
  onTagClick?: (tag: { name: string; id: string }) => void;
}

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

export function RelatedTagsCard({ tagId, sourceCategory }: RelatedTagsCardProps) {
  const { data: similarTags, isLoading } = useSimilarTags(tagId, 15);
  const { enabled: safeEnabled } = useSafeMode();
  const { t } = useTranslation();

  const ranked = useMemo(
    () => rankAndFilter(similarTags ?? [], sourceCategory, safeEnabled).slice(0, 10),
    [similarTags, sourceCategory, safeEnabled],
  );

  if (isLoading) {
    return (
      <div>
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
          {t('resources.tagDetail.seeAlso', 'See also')}
        </h2>
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 rounded-element" />
          ))}
        </div>
      </div>
    );
  }

  if (ranked.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
        {t('resources.tagDetail.seeAlso', 'See also')}
      </h2>
      <div className="flex flex-wrap gap-2">
        {ranked.map((tag) => (
          <TagChip key={tag.tag_id} tag={tag.slug || tag.name} name={tag.name} />
        ))}
      </div>
    </div>
  );
}
