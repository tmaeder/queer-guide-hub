import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type CentralizedTag } from '@/hooks/useCentralizedTags';
import { TagListRenderer } from '@/components/resources/TagListRenderer';
import { getCategoryShortName } from '@/components/resources/categoryMeta';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tag } from 'lucide-react';
import type { ViewMode, DisplayMode } from './resourceHelpers';

interface ResourceSearchProps {
  viewMode: ViewMode;
  filterCategory: string;
  filteredAndSortedTags: CentralizedTag[];
  tagUsageCounts: Record<string, number>;
  displayMode: DisplayMode;
  onTagClick: (tag: CentralizedTag) => void;
}

const PAGE_SIZE = 30;

export function ResourceSearch({
  viewMode,
  filterCategory,
  filteredAndSortedTags,
  tagUsageCounts,
  displayMode,
  onTagClick,
}: ResourceSearchProps) {
  const { t } = useTranslation();
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filteredAndSortedTags]);

  const total = filteredAndSortedTags.length;
  const shown = Math.min(visibleCount, total);
  const visibleTags = filteredAndSortedTags.slice(0, visibleCount);
  const remaining = total - shown;
  const paginated = visibleCount < total;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h6 className="text-base font-semibold">
          {viewMode === 'search'
            ? t('resources.search.resultsHeading')
            : filterCategory !== 'all'
              ? t('resources.search.categoryTagsHeading', { category: getCategoryShortName(filterCategory) })
              : t('resources.search.filteredHeading')}
        </h6>
        <Badge
          variant="secondary"
          title={t('resources.search.countAria', { count: total })}
          aria-label={t('resources.search.countAria', { count: total })}
        >
          {paginated ? t('resources.search.countBadge', { visible: shown, total }) : total}
        </Badge>
      </div>
      {total > 0 ? (
        <>
          <TagListRenderer
            tags={visibleTags}
            displayMode={displayMode}
            tagUsageCounts={tagUsageCounts}
            onTagClick={onTagClick}
          />
          {paginated && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                {t('resources.search.showMore', { count: Math.min(PAGE_SIZE, remaining) })}
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={Tag}
          title={t('resources.search.empty.title')}
          description={t('resources.search.empty.description')}
          mood="encouraging"
        />
      )}
    </div>
  );
}
