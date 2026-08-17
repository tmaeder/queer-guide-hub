/**
 * CategoryTreeRail — the taxonomy as a route index.
 *
 * Ten parent lines, each expanding to its stops. Redraws RouteStrip's grammar
 * rather than reusing the component: RouteStrip's stations are `<a href="#id">`
 * in-page anchors driven by a scroll-spy, and these are route links to
 * `/tags/c/:categorySlug`. Same line, same rings, same ink label plate — a
 * different destination.
 *
 * Monochrome by construction. See categoryIdentity.ts for why the ten parents
 * are told apart by icon and not by track colour.
 *
 * Non-category params ride along in `paramsSuffix`, so switching lines keeps
 * the reader's sort, letter and display mode instead of resetting them.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { StationRing } from '@/components/transit/StationRing';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { PAGE_BLEED } from '@/components/layout/PageContainer';
import { getCategoryShortName, parentOrder } from '@/components/resources/categoryMeta';
import { CATEGORY_LINES, DEFAULT_CATEGORY_ICON } from '@/lib/tags/categoryIdentity';
import { CHIP, CHIP_OFF, CHIP_ON } from './TagsFilterSpine';
import type { CategoryTreeNode } from '@/hooks/useCentralizedTags';

interface CategoryTreeRailProps {
  tree: CategoryTreeNode[];
  /** From `useParams().categorySlug` — may name a parent or one of its stops. */
  activeSlug: string | null;
  /** Serialized non-category params, already prefixed with `?` when non-empty. */
  paramsSuffix: string;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

/** Parents in canonical order, dropping any the tree has not returned. */
function orderParents(tree: CategoryTreeNode[]): CategoryTreeNode[] {
  return parentOrder
    .map((name) => tree.find((c) => c.name === name))
    .filter((c): c is CategoryTreeNode => !!c);
}

export function CategoryTreeRail({
  tree,
  activeSlug,
  paramsSuffix,
  orientation = 'vertical',
  className,
}: CategoryTreeRailProps) {
  const { t } = useTranslation();
  const parents = orderParents(tree);

  // A stop is active → its line opens. Otherwise the reader opens lines
  // themselves; ten expanded lines is a wall, not an index.
  const activeParent = parents.find(
    (p) => p.slug === activeSlug || p.children?.some((c) => c.slug === activeSlug),
  );
  const [expanded, setExpanded] = useState<string | null>(activeParent?.slug ?? null);

  const href = (slug: string | null) =>
    slug ? `/tags/c/${slug}${paramsSuffix}` : `/tags${paramsSuffix}`;

  if (orientation === 'horizontal') {
    return (
      <nav
        aria-label={t('tags.rail.label', 'Topic lines')}
        className={cn('border-b border-border-hairline bg-background', PAGE_BLEED, className)}
      >
        <div className="flex items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6 md:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <LocalizedLink
            to={href(null)}
            aria-current={!activeSlug ? 'page' : undefined}
            className={cn(CHIP, 'no-underline', !activeSlug ? CHIP_ON : CHIP_OFF)}
          >
            {t('tags.rail.all', 'All terms')}
          </LocalizedLink>
          {parents.map((p) => {
            const line = CATEGORY_LINES[p.name];
            const isActive = p.slug === activeSlug || activeParent?.slug === p.slug;
            return (
              <LocalizedLink
                key={p.id}
                to={href(p.slug)}
                aria-current={p.slug === activeSlug ? 'page' : undefined}
                className={cn(
                  CHIP,
                  'inline-flex items-center gap-2 whitespace-nowrap no-underline',
                  isActive ? CHIP_ON : CHIP_OFF,
                )}
              >
                <TransitIcon name={line?.icon ?? DEFAULT_CATEGORY_ICON} size={14} />
                {getCategoryShortName(p.name)}
              </LocalizedLink>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label={t('tags.rail.label', 'Topic lines')} className={cn('relative', className)}>
      {/* The line itself, behind the stations. Inset top and bottom so it
          terminates at the first and last ring rather than running off the ends
          of the list. */}
      <span aria-hidden className="absolute bottom-3 left-0 top-3 flex w-4 justify-center">
        <span className="h-full w-[3px] bg-foreground" />
      </span>

      <ol className="relative flex flex-col gap-1">
        <li>
          <LocalizedLink
            to={href(null)}
            aria-current={!activeSlug ? 'page' : undefined}
            className="group flex items-start gap-2 no-underline"
          >
            <span className="flex w-4 shrink-0 justify-center pt-1.5">
              <StationRing
                state={!activeSlug ? 'typed' : 'open'}
                className={cn(!activeSlug && 'bg-foreground')}
              />
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 px-2 py-1 text-left text-13 leading-snug transition-colors',
                !activeSlug
                  ? 'bg-foreground font-bold text-background'
                  : 'text-muted-foreground group-hover:bg-surface-container group-hover:text-foreground',
              )}
            >
              {t('tags.rail.all', 'All terms')}
            </span>
          </LocalizedLink>
        </li>

        {parents.map((p) => {
          const line = CATEGORY_LINES[p.name];
          const isOpen = expanded === p.slug;
          const isActive = p.slug === activeSlug;
          const onLine = isActive || activeParent?.slug === p.slug;
          return (
            <li key={p.id}>
              <div className="flex items-start gap-2">
                <LocalizedLink
                  to={href(p.slug)}
                  aria-current={isActive ? 'page' : undefined}
                  className="group flex min-w-0 flex-1 items-start gap-2 no-underline"
                >
                  <span className="flex w-4 shrink-0 justify-center pt-1.5">
                    <StationRing
                      state={isActive ? 'typed' : onLine ? 'done' : 'open'}
                      className={cn(isActive && 'bg-foreground')}
                    />
                  </span>
                  <span
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left text-13 leading-snug transition-colors',
                      isActive
                        ? 'bg-foreground font-bold text-background'
                        : 'text-muted-foreground group-hover:bg-surface-container group-hover:text-foreground',
                    )}
                  >
                    <TransitIcon
                      name={line?.icon ?? DEFAULT_CATEGORY_ICON}
                      size={16}
                      className="shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate">{getCategoryShortName(p.name)}</span>
                    <span
                      className={cn(
                        'shrink-0 tabular-nums',
                        isActive ? 'text-background/70' : 'text-muted-foreground',
                      )}
                    >
                      {p.total_tag_count || p.tag_count}
                    </span>
                  </span>
                </LocalizedLink>
                {p.children?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : p.slug)}
                    aria-expanded={isOpen}
                    aria-label={
                      isOpen
                        ? t('tags.rail.collapseAria', 'Hide stops on {{line}}', {
                            line: getCategoryShortName(p.name),
                          })
                        : t('tags.rail.expandAria', 'Show stops on {{line}}', {
                            line: getCategoryShortName(p.name),
                          })
                    }
                    className="mt-0.5 shrink-0 px-1.5 py-0.5 text-2xs font-bold leading-none transition-colors hover:bg-foreground hover:text-background"
                  >
                    {isOpen ? '–' : '+'}
                  </button>
                )}
              </div>

              {isOpen && p.children?.length > 0 && (
                <ol className="mt-1 flex flex-col gap-0.5">
                  {p.children.map((child) => {
                    const childActive = child.slug === activeSlug;
                    return (
                      <li key={child.id}>
                        <LocalizedLink
                          to={href(child.slug)}
                          aria-current={childActive ? 'page' : undefined}
                          className="group flex items-start gap-2 no-underline"
                        >
                          <span className="flex w-4 shrink-0 justify-center pt-2">
                            {/* Sub-stations take a smaller marker so the eye
                                reads the hierarchy before it reads the indent. */}
                            <span
                              aria-hidden
                              className={cn(
                                'inline-block h-2.5 w-2.5 rounded-full border border-border-hairline',
                                childActive ? 'bg-foreground' : 'bg-background',
                              )}
                            />
                          </span>
                          <span
                            className={cn(
                              'ml-4 flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left text-2xs leading-snug transition-colors',
                              childActive
                                ? 'bg-foreground font-bold text-background'
                                : 'text-muted-foreground group-hover:bg-surface-container group-hover:text-foreground',
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {getCategoryShortName(child.name)}
                            </span>
                            <span
                              className={cn(
                                'shrink-0 tabular-nums',
                                childActive ? 'text-background/70' : 'text-muted-foreground',
                              )}
                            >
                              {child.tag_count}
                            </span>
                          </span>
                        </LocalizedLink>
                      </li>
                    );
                  })}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
