/**
 * TagsFilterSpine — the glossary's control bar.
 *
 * The page's ONLY sticky element, following HelpFilterSpine's grammar: the bar
 * bleeds to the viewport edge, its bottom rule IS the band's edge, and the
 * contents re-take the gutter so they stay aligned with the column.
 *
 * Three deliberate departures from the filter bar this replaces:
 *
 * - **Sort is chips, not a `<Select>`.** Three options do not warrant a
 *   dropdown, and a Select would drag lucide back onto a surface that is
 *   otherwise entirely TransitIcon (the two icon sets never mix).
 * - **No "Advanced" disclosure.** It hid exactly two booleans. A disclosure
 *   over two booleans is theatre; they are inline chips now.
 * - **No category `<Select>`.** The taxonomy is a route, drawn by
 *   CategoryTreeRail — 56 shareable URLs instead of one dropdown value.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { PAGE_BLEED, STICKY_UNDER_HEADER } from '@/components/layout/PageContainer';
import {
  TAG_SORTS,
  type TagSort,
  type TagView,
  type TagUsageFilter,
} from '@/lib/tags/tagsIndexState';

const VIEW_TABS: { key: TagView; icon: TransitIconName; labelKey: string; fallback: string }[] = [
  { key: 'grid', icon: 'library', labelKey: 'tags.view.grid', fallback: 'Grid' },
  { key: 'list', icon: 'documents', labelKey: 'tags.view.list', fallback: 'List' },
  { key: 'chips', icon: 'filter', labelKey: 'tags.view.chips', fallback: 'Chips' },
  { key: 'graph', icon: 'route', labelKey: 'tags.view.graph', fallback: 'Graph' },
];

const SORT_LABELS: Record<TagSort, { key: string; fallback: string }> = {
  usage: { key: 'tags.sort.usage', fallback: 'Most used' },
  alphabetical: { key: 'tags.sort.alphabetical', fallback: 'A–Z' },
  recent: { key: 'tags.sort.recent', fallback: 'Newest' },
};

/** The one chip recipe on this page. Shared with CategoryTreeRail's mobile row
 *  and RouteStrip's horizontal stations so every chip on the surface matches. */
export const CHIP =
  'shrink-0 bg-muted rounded-element px-4 py-1 text-13 font-bold transition-colors';
export const CHIP_ON = 'bg-foreground text-background';
export const CHIP_OFF = 'bg-background hover:bg-surface-container';

interface TagsFilterSpineProps {
  q: string;
  onQ: (v: string) => void;
  view: TagView;
  onView: (v: TagView) => void;
  sort: TagSort;
  onSort: (v: TagSort) => void;
  dir: 'asc' | 'desc';
  onDir: () => void;
  usage: TagUsageFilter;
  onUsage: (v: TagUsageFilter) => void;
  hasImage: boolean;
  onHasImage: (v: boolean) => void;
}

export function TagsFilterSpine({
  q,
  onQ,
  view,
  onView,
  sort,
  onSort,
  dir,
  onDir,
  usage,
  onUsage,
  hasImage,
  onHasImage,
}: TagsFilterSpineProps) {
  const { t } = useTranslation();

  return (
    <>
      <div
        className={cn(
          `sticky ${STICKY_UNDER_HEADER} z-30 border-b border-border-hairline bg-background`,
          PAGE_BLEED,
        )}
      >
        <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6 md:px-8">
          <div className="relative min-w-[200px] flex-1">
            <label htmlFor="tags-search" className="sr-only">
              {t('tags.spine.searchLabel', 'Search the glossary')}
            </label>
            <Input
              id="tags-search"
              type="search"
              value={q}
              onChange={(e) => onQ(e.target.value)}
              placeholder={t('tags.spine.searchPlaceholder', 'Search terms, or a synonym')}
            />
            <TransitIcon
              name="search"
              size={16}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>

          <div
            role="tablist"
            aria-label={t('tags.view.label', 'Display')}
            className="inline-flex border border-border-hairline"
          >
            {VIEW_TABS.map(({ key, icon, labelKey, fallback }, i) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => onView(key)}
                title={t(labelKey, fallback)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-13 font-bold transition-colors',
                  i > 0 && 'border-l border-border-hairline',
                  view === key ? CHIP_ON : CHIP_OFF,
                )}
              >
                <TransitIcon name={icon} size={14} />
                <span className="hidden sm:inline">{t(labelKey, fallback)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
          {t('tags.sort.label', 'Sort')}
        </span>
        {TAG_SORTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSort(s)}
            aria-pressed={sort === s}
            className={cn(CHIP, sort === s ? CHIP_ON : CHIP_OFF)}
          >
            {t(SORT_LABELS[s].key, SORT_LABELS[s].fallback)}
          </button>
        ))}
        <button
          type="button"
          onClick={onDir}
          className={cn(CHIP, CHIP_OFF)}
          aria-label={
            dir === 'asc'
              ? t('tags.sort.dirAsc', 'Ascending — switch to descending')
              : t('tags.sort.dirDesc', 'Descending — switch to ascending')
          }
        >
          {dir === 'asc' ? '↑' : '↓'}
        </button>

        <span aria-hidden className="mx-1 h-5 w-[2px] bg-foreground" />

        <button
          type="button"
          onClick={() => onUsage(usage === 'used' ? 'all' : 'used')}
          aria-pressed={usage === 'used'}
          className={cn(CHIP, usage === 'used' ? CHIP_ON : CHIP_OFF)}
        >
          {t('tags.filter.used', 'In use')}
        </button>
        <button
          type="button"
          onClick={() => onUsage(usage === 'unused' ? 'all' : 'unused')}
          aria-pressed={usage === 'unused'}
          className={cn(CHIP, usage === 'unused' ? CHIP_ON : CHIP_OFF)}
        >
          {t('tags.filter.unused', 'Unused')}
        </button>
        <button
          type="button"
          onClick={() => onHasImage(!hasImage)}
          aria-pressed={hasImage}
          className={cn(CHIP, hasImage ? CHIP_ON : CHIP_OFF)}
        >
          {t('tags.filter.withImage', 'Illustrated')}
        </button>
      </div>
    </>
  );
}
