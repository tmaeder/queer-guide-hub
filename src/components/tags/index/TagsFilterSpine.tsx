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
  type TagKindFilter,
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
  'inline-flex min-h-11 shrink-0 items-center justify-center rounded-element px-4 py-2 text-13 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
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
  kind: TagKindFilter;
  onKind: (v: TagKindFilter) => void;
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
  kind,
  onKind,
}: TagsFilterSpineProps) {
  const { t } = useTranslation();

  return (
    <>
      <div
        className={cn(
          `sticky ${STICKY_UNDER_HEADER} z-30 overflow-hidden rounded-container border-b border-border-hairline bg-background`,
          PAGE_BLEED,
        )}
      >
        <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6 md:px-8">
          <div className="relative min-w-0 basis-full sm:basis-auto sm:flex-1">
            <label htmlFor="tags-search" className="sr-only">
              {t('tags.spine.searchLabel', 'Search the glossary')}
            </label>
            <Input
              id="tags-search"
              type="search"
              value={q}
              onChange={(e) => onQ(e.target.value)}
              placeholder={t('tags.spine.searchPlaceholder', 'Search terms, or a synonym')}
              className="min-h-12 pr-12"
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
            className="inline-flex rounded-element bg-muted p-1"
          >
            {VIEW_TABS.map(({ key, icon, labelKey, fallback }, i) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                aria-label={t(labelKey, fallback)}
                tabIndex={view === key ? 0 : -1}
                onClick={() => onView(key)}
                onKeyDown={(event) => {
                  let next: number;
                  if (event.key === 'ArrowRight') next = (i + 1) % VIEW_TABS.length;
                  else if (event.key === 'ArrowLeft')
                    next = (i - 1 + VIEW_TABS.length) % VIEW_TABS.length;
                  else if (event.key === 'Home') next = 0;
                  else if (event.key === 'End') next = VIEW_TABS.length - 1;
                  else return;
                  event.preventDefault();
                  onView(VIEW_TABS[next].key);
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                    [next]?.focus();
                }}
                title={t(labelKey, fallback)}
                className={cn(
                  'flex min-h-11 items-center gap-1.5 rounded-element px-2 py-2 text-13 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  view === key ? CHIP_ON : CHIP_OFF,
                )}
              >
                <TransitIcon name={icon} size={14} />
                <span>{t(labelKey, fallback)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex min-w-0 flex-col gap-2 xl:flex-row xl:flex-wrap xl:items-center">
        <div className="flex items-center gap-1 overflow-x-auto">
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
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
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

          <span aria-hidden className="mx-1 h-5 w-[2px] bg-foreground" />

          <div
            role="group"
            aria-label={t('search.filters', 'Filters')}
            className="flex items-center gap-1"
          >
            <button
              type="button"
              onClick={() => onKind('all')}
              aria-pressed={kind === 'all'}
              className={cn(CHIP, kind === 'all' ? CHIP_ON : CHIP_OFF)}
            >
              {t('search.all', 'All')}
            </button>
            <button
              type="button"
              onClick={() => onKind('concept')}
              aria-pressed={kind === 'concept'}
              className={cn(CHIP, kind === 'concept' ? CHIP_ON : CHIP_OFF)}
            >
              {t('tags.filter.kindConcept', 'Terms')}
            </button>
            <button
              type="button"
              onClick={() => onKind('descriptor')}
              aria-pressed={kind === 'descriptor'}
              className={cn(CHIP, kind === 'descriptor' ? CHIP_ON : CHIP_OFF)}
            >
              {t('tags.filter.kindDescriptor', 'Labels')}
            </button>
            <button
              type="button"
              onClick={() => onKind('place')}
              aria-pressed={kind === 'place'}
              className={cn(CHIP, kind === 'place' ? CHIP_ON : CHIP_OFF)}
            >
              {t('tags.filter.kindPlace', 'Places')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
