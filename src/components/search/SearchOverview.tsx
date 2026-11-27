import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { ArrowRight } from '@/components/icons';
import type { SearchGroup, SearchResult } from '@/hooks/useSearch';
import { SearchResultCard } from './SearchResultCard';
import { scopeLabel } from '@/lib/searchScopeLabel';

export interface SearchOverviewProps {
  groups: SearchGroup[];
  query: string;
  /** Open the full list for one type: the same thing its scope chip does. */
  onSeeAll: (type: string) => void;
  /** Analytics only; the card navigates itself through a real link. */
  onActivate?: (result: SearchResult, section: string, position: number) => void;
  onTagClick?: (tag: string) => void;
  activeTags?: string[];
}

/**
 * The "All" view of /search: one section per content type, in the order the
 * worker gives (where each type's first hit falls in the mixed ranking). Each
 * section shows its top few results and links to the scoped list, so separate
 * types no longer compete for one ranking.
 */
export function SearchOverview({
  groups,
  query,
  onSeeAll,
  onActivate,
  onTagClick,
  activeTags,
}: SearchOverviewProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-10 pb-4">
      {groups.map((group) => {
        const label = scopeLabel(t, group.type);
        const headingId = `search-section-${group.type}`;
        const more = group.total > group.hits.length;
        return (
          <section
            key={group.type}
            aria-labelledby={headingId}
            data-testid={`search-section-${group.type}`}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 id={headingId} className="flex min-w-0 items-center gap-2 font-sans text-title">
                {/* The label beside it names the type; the bullet is the line colour only. */}
                <RouteBullet type={group.type} size={24} decorative />
                <span className="truncate">{label}</span>
                <span className="text-15 font-normal tabular-nums text-muted-foreground">
                  {group.total.toLocaleString()}
                </span>
              </h2>
              {more && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-2"
                  onClick={() => onSeeAll(group.type)}
                >
                  {t('search.overview.seeAll', {
                    defaultValue: 'See all {{count}}',
                    count: group.total.toLocaleString(),
                  })}
                  {/* Every section has a "See all"; name the section for screen
                      readers without changing the visible label (WCAG 2.5.3). */}
                  <span className="sr-only">{label}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-4">
              {group.hits.map((hit, i) => (
                <SearchResultCard
                  key={`${hit.type}-${hit.objectID}`}
                  result={hit}
                  view="list"
                  query={query}
                  onActivate={onActivate ? (r) => onActivate(r, group.type, i) : undefined}
                  onTagClick={onTagClick}
                  activeTags={activeTags}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
