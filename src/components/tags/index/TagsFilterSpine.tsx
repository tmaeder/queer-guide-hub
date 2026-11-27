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
import {
  PAGE_BLEED,
  PAGE_BLEED_GUTTER,
  STICKY_UNDER_HEADER,
} from '@/components/layout/PageContainer';
import {
  TAG_SORTS,
  type TagSort,
  type TagView,
  type TagUsageFilter,
  type TagKindFilter,
} from '@/lib/tags/tagsIndexState';

const VIEW_TABS: { key: TagView; icon: TransitIconName; labelKey: string; fallback: string }[] = [
  { key: 'grid', icon: 'grid', labelKey: 'tags.view.grid', fallback: 'Grid' },
  { key: 'list', icon: 'list', labelKey: 'tags.view.list', fallback: 'List' },
  { key: 'chips', icon: 'hash', labelKey: 'tags.view.chips', fallback: 'Chips' },
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
  'inline-flex min-h-11 shrink-0 items-center justify-center rounded-element px-4 py-2 text-13 font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
export const CHIP_ON = 'bg-foreground text-background';
export const CHIP_OFF = 'bg-background hover:bg-surface-container';

const SORT_ICONS: Record<TagSort, TransitIconName> = {
  usage: 'trend-up',
  alphabetical: 'list-ordered',
  recent: 'sparkle',
};

const SEG = 'inline-flex shrink-0 items-center gap-0.5 rounded-element bg-muted p-0.5';

function IconToggle({
  icon,
  label,
  pressed,
  onClick,
}: {
  icon: TransitIconName;
  label: string;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-11 place-items-center rounded-element transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        pressed ? CHIP_ON : 'hover:bg-background',
      )}
    >
      <TransitIcon name={icon} size={20} aria-hidden />
    </button>
  );
}

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
          `sticky ${STICKY_UNDER_HEADER} z-30 overflow-hidden rounded-container border-b border-border-hairline sticky-glass`,
          PAGE_BLEED,
        )}
      >
        <div
          className={cn(
            'mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-2 py-1 md:py-2',
            PAGE_BLEED_GUTTER,
          )}
        >
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
              className="min-h-12 pr-24"
            />
            <TransitIcon
              name="search"
              size={20}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          </div>

          <div
            role="tablist"
            aria-label={t('tags.view.label', 'Display')}
            className="inline-flex gap-0.5 rounded-element bg-muted p-0.5"
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
                  'grid size-11 place-items-center rounded-element transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  view === key ? CHIP_ON : 'hover:bg-background',
                )}
              >
                <TransitIcon name={icon} size={20} aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Three segmented icon groups: sort, usage, kind. Each button names
          itself via aria-label + title; the icon is the visible cue. */}
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
        <div role="group" aria-label={t('tags.sort.label', 'Sort')} className={SEG}>
          {TAG_SORTS.map((s) => (
            <IconToggle
              key={s}
              icon={SORT_ICONS[s]}
              label={t(SORT_LABELS[s].key, SORT_LABELS[s].fallback)}
              pressed={sort === s}
              onClick={() => onSort(s)}
            />
          ))}
          <IconToggle
            icon={dir === 'asc' ? 'arrow-up' : 'arrow-down'}
            label={
              dir === 'asc'
                ? t('tags.sort.dirAsc', 'Ascending — switch to descending')
                : t('tags.sort.dirDesc', 'Descending — switch to ascending')
            }
            onClick={onDir}
          />
        </div>
        <div role="group" aria-label={t('tags.filter.usage', 'Usage')} className={SEG}>
          <IconToggle
            icon="check"
            label={t('tags.filter.used', 'In use')}
            pressed={usage === 'used'}
            onClick={() => onUsage(usage === 'used' ? 'all' : 'used')}
          />
          <IconToggle
            icon="eye-off"
            label={t('tags.filter.unused', 'Unused')}
            pressed={usage === 'unused'}
            onClick={() => onUsage(usage === 'unused' ? 'all' : 'unused')}
          />
        </div>
        <div role="group" aria-label={t('search.filters', 'Filters')} className={SEG}>
          <IconToggle
            icon="layers"
            label={t('search.all', 'All')}
            pressed={kind === 'all'}
            onClick={() => onKind('all')}
          />
          <IconToggle
            icon="library"
            label={t('tags.filter.kindConcept', 'Terms')}
            pressed={kind === 'concept'}
            onClick={() => onKind('concept')}
          />
          <IconToggle
            icon="tag"
            label={t('tags.filter.kindDescriptor', 'Labels')}
            pressed={kind === 'descriptor'}
            onClick={() => onKind('descriptor')}
          />
        </div>
      </div>
    </>
  );
}
