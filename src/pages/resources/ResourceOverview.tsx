import { type CentralizedTag, type CategoryTreeNode } from '@/hooks/useCentralizedTags';
import { TagListRenderer } from '@/components/resources/TagListRenderer';
import {
  getCategoryIcon,
  getCategoryShortName,
} from '@/components/resources/categoryMeta';
import { useSafeMode } from '@/providers/SafeModeProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Briefcase, Zap, ChevronRight, Phone } from 'lucide-react';
import { hoverCardCls } from './resourceHelpers';

interface ResourceOverviewProps {
  popularTags: CentralizedTag[];
  orderedParents: CategoryTreeNode[];
  tagUsageCounts: Record<string, number>;
  professionCount: number;
  onTagClick: (tag: CentralizedTag) => void;
  onShowProfessions: () => void;
}

export function ResourceOverview({
  popularTags,
  orderedParents,
  tagUsageCounts,
  professionCount,
  onTagClick,
  onShowProfessions,
}: ResourceOverviewProps) {
  const safeMode = useSafeMode();

  return (
    <div className="flex flex-col gap-8">
      {popularTags.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Zap style={{ width: 18, height: 18 }} />
            <h2 className="text-base font-semibold">Popular tags</h2>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-xs"
              onClick={() => safeMode.toggle()}
              data-testid="safe-mode-toggle"
              aria-pressed={!safeMode.enabled}
            >
              {safeMode.enabled ? 'Show 18+ content' : 'Hide 18+ content'}
            </Button>
          </div>
          <TagListRenderer
            tags={popularTags}
            displayMode="chips"
            tagUsageCounts={tagUsageCounts}
            onTagClick={onTagClick}
          />
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold mb-4">Browse by category</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {orderedParents.map((cat) => {
            const Icon = getCategoryIcon(cat.name);
            const activeChildren = cat.children?.filter((c) => c.tag_count > 0) ?? [];
            return (
              <LocalizedLink
                key={cat.id}
                to={`/resources/c/${encodeURIComponent(cat.slug)}`}
                className={`${hoverCardCls} flex-col items-stretch gap-1.5 no-underline text-inherit`}
                style={{ minHeight: 96 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon style={{ width: 18, height: 18, opacity: 0.75 }} />
                    <span className="font-semibold" style={{ fontSize: '0.9rem' }}>
                      {getCategoryShortName(cat.name)}
                    </span>
                  </div>
                  <Badge
                    variant="secondary"
                    title={`${cat.total_tag_count} tags total (across all subcategories)`}
                    aria-label={`${cat.total_tag_count} tags total across all subcategories`}
                  >
                    {cat.total_tag_count}
                  </Badge>
                </div>
                {activeChildren.length > 0 && (
                  <span
                    className="text-xs text-muted-foreground overflow-hidden"
                    style={{
                      fontSize: '0.7rem',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      lineHeight: 1.4,
                    }}
                    title="Each subcategory's count is the number of tags directly assigned to it"
                  >
                    {activeChildren
                      .map((c) => `${getCategoryShortName(c.name)} (${c.tag_count})`)
                      .join(' · ')}
                  </span>
                )}
              </LocalizedLink>
            );
          })}
          <button
            onClick={onShowProfessions}
            className={`${hoverCardCls} flex-col items-stretch gap-1.5`}
            style={{ minHeight: 96 }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Briefcase style={{ width: 18, height: 18, opacity: 0.75 }} />
                <span className="font-semibold" style={{ fontSize: '0.9rem' }}>
                  Professions
                </span>
              </div>
              <Badge variant="secondary">{professionCount}</Badge>
            </div>
            <span className="text-xs text-muted-foreground" style={{ fontSize: '0.7rem', lineHeight: 1.4 }}>
              Browse LGBTQ+ personalities by profession
            </span>
          </button>
          {/* Crisis help card */}
          <LocalizedLink
            to="/help"
            className={`${hoverCardCls} flex-col items-stretch gap-1.5 no-underline text-inherit border-l-[3px] border-destructive`}
            style={{ minHeight: 96 }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Phone style={{ width: 18, height: 18, opacity: 0.75 }} />
                <span className="font-semibold" style={{ fontSize: '0.9rem' }}>
                  Crisis Hotlines
                </span>
              </div>
              <ChevronRight style={{ width: 16, height: 16, opacity: 0.4 }} />
            </div>
            <span className="text-xs text-muted-foreground" style={{ fontSize: '0.7rem', lineHeight: 1.4 }}>
              Free, anonymous LGBTQIA+ crisis support worldwide
            </span>
          </LocalizedLink>
        </div>
      </div>
    </div>
  );
}
