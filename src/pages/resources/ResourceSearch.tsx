import { type CentralizedTag } from '@/hooks/useCentralizedTags';
import { TagListRenderer } from '@/components/resources/TagListRenderer';
import { getCategoryShortName } from '@/components/resources/categoryMeta';
import { Badge } from '@/components/ui/badge';
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

export function ResourceSearch({
  viewMode,
  filterCategory,
  filteredAndSortedTags,
  tagUsageCounts,
  displayMode,
  onTagClick,
}: ResourceSearchProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h6 className="text-base font-semibold">
          {viewMode === 'search'
            ? 'Search results'
            : filterCategory !== 'all'
              ? `${getCategoryShortName(filterCategory)} tags`
              : 'Filtered tags'}
        </h6>
        <Badge
          variant="secondary"
          title={`${filteredAndSortedTags.length} matching tags`}
          aria-label={`${filteredAndSortedTags.length} matching tags`}
        >
          {filteredAndSortedTags.length}
        </Badge>
      </div>
      {filteredAndSortedTags.length > 0 ? (
        <TagListRenderer
          tags={filteredAndSortedTags}
          displayMode={displayMode}
          tagUsageCounts={tagUsageCounts}
          onTagClick={onTagClick}
        />
      ) : (
        <EmptyState
          icon={Tag}
          title="No results"
          description="Try a broader query or clearing your filters."
          mood="encouraging"
        />
      )}
    </div>
  );
}
