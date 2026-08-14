/**
 * TagResults — one result set, four ways to look at it.
 *
 * Grid and list virtualize through the existing VirtualizedGrid (window-
 * scrolled, self-measuring, already shipping on /personalities); below its
 * `virtualizeAfter` threshold it renders the plain grid, so a small category
 * view stays byte-identical for the SEO and a11y snapshots.
 *
 * **Chips are capped, not virtualized.** They wrap at variable widths, and
 * fixed-row virtualization cannot express that. A "show more" escalation is the
 * honest version — and with a line or a letter selected the set is almost
 * always under the cap anyway.
 *
 * Four columns, not five: the 224px taxonomy rail takes the width the fifth
 * would have needed.
 */

import { useEffect, useState, Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { VirtualizedGrid } from '@/components/ui/VirtualizedGrid';
import { useGridColumns } from '@/components/ui/useGridColumns';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { TagChip } from '@/components/tags/TagChip';
import { TagIndexCard, TagIndexRow } from './TagIndexCard';
import type { CategoryLine } from '@/lib/tags/categoryIdentity';
import type { TagView } from '@/lib/tags/tagsIndexState';
import type { CentralizedTag } from '@/hooks/useCentralizedTags';

const TagRelationshipGraph = lazy(() => import('@/components/tags/TagRelationshipGraph'));

const GRID_CLASS =
  'grid grid-cols-2 gap-4 pb-4 sm:grid-cols-3 md:grid-cols-4 md:pb-6 [&>*]:min-w-0';
const GRID_BREAKPOINTS = [
  { minWidth: 0, columns: 2 },
  { minWidth: 640, columns: 3 },
  { minWidth: 768, columns: 4 },
];
const LIST_CLASS = 'grid grid-cols-1 gap-2 pb-4';
const LIST_BREAKPOINTS = [{ minWidth: 0, columns: 1 }];

/** Chips are cheap, but 3,700 of them still costs a second of layout. */
const CHIP_PAGE = 400;

export interface TagResultsProps {
  view: TagView;
  tags: CentralizedTag[];
  usageCounts: Record<string, number>;
  lineFor: (tag: CentralizedTag) => CategoryLine | undefined;
  categoryLabelFor: (tag: CentralizedTag) => string | undefined;
  /** Ids the query reached through a synonym rather than the canonical name. */
  aliasIds?: Set<string>;
  /** Graph view only — narrows the graph to one parent category. */
  graphCategory?: string | null;
  graphCategories?: string[];
}

export function TagResults({
  view,
  tags,
  usageCounts,
  lineFor,
  categoryLabelFor,
  aliasIds,
  graphCategory = null,
  graphCategories = [],
}: TagResultsProps) {
  const { t } = useTranslation();
  const gridColumns = useGridColumns(GRID_BREAKPOINTS);
  const listColumns = useGridColumns(LIST_BREAKPOINTS);
  const [chipLimit, setChipLimit] = useState(CHIP_PAGE);

  // A new result set starts from the top of the chip cloud; keeping the old
  // limit means a narrower search silently renders "show 400 more" over 12 tags.
  useEffect(() => setChipLimit(CHIP_PAGE), [tags]);

  if (view === 'graph') {
    return (
      <Suspense fallback={<TrackLoader label={t('tags.loading', 'Loading the glossary')} />}>
        <div className="h-[520px] w-full border-[3px] border-foreground md:h-[640px]">
          <TagRelationshipGraph categoryFilter={graphCategory} categories={graphCategories} />
        </div>
      </Suspense>
    );
  }

  if (view === 'chips') {
    const shown = tags.slice(0, chipLimit);
    return (
      <>
        <div className="flex flex-wrap gap-2">
          {shown.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag.slug}
              name={tag.name}
              count={usageCounts[tag.name] || 0}
            />
          ))}
        </div>
        {tags.length > shown.length && (
          <button
            type="button"
            onClick={() => setChipLimit((n) => n + CHIP_PAGE)}
            className="mt-6 border-2 border-foreground px-4 py-2 text-13 font-bold transition-colors hover:bg-foreground hover:text-background"
          >
            {t('tags.showMore', 'Show {{count}} more', {
              count: Math.min(CHIP_PAGE, tags.length - shown.length),
            })}
          </button>
        )}
      </>
    );
  }

  if (view === 'list') {
    return (
      <VirtualizedGrid
        items={tags}
        columns={listColumns}
        rowClassName={LIST_CLASS}
        estimateRowHeight={92}
        itemKey={(tag) => tag.id}
        renderItem={(tag) => (
          <TagIndexRow
            tag={tag}
            uses={usageCounts[tag.name] || 0}
            line={lineFor(tag)}
            categoryLabel={categoryLabelFor(tag)}
            aliasMatch={aliasIds?.has(tag.id)}
          />
        )}
      />
    );
  }

  return (
    <VirtualizedGrid
      items={tags}
      columns={gridColumns}
      rowClassName={GRID_CLASS}
      estimateRowHeight={268}
      itemKey={(tag) => tag.id}
      renderItem={(tag) => (
        <TagIndexCard
          tag={tag}
          uses={usageCounts[tag.name] || 0}
          line={lineFor(tag)}
          categoryLabel={categoryLabelFor(tag)}
          aliasMatch={aliasIds?.has(tag.id)}
        />
      )}
    />
  );
}
