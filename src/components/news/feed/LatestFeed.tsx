import { useTranslation } from 'react-i18next';
import { ArrowUp } from 'lucide-react';
import { FeedGrid } from './FeedGrid';
import { timeAgo } from '@/lib/relativeTime';
import type { NewsCategory } from '@/hooks/useNews';
import type { NewsDensity } from '@/hooks/useNewsDensity';

type Article = Record<string, unknown> & { id: string; published_at?: string | null };

interface LatestFeedProps {
  articles: Article[];
  density: NewsDensity;
  newCount: number;
  onShowNew: () => void;
  sourcesMap?: Record<string, { id: string; name: string; url?: string }>;
  categoriesMap?: Record<string, NewsCategory>;
  onViewArticle?: (id: string) => void;
}

// Newest-first lane. Surfaces realtime arrivals via an opt-in "Show N new" bar
// (no scroll jump) and a relative-time freshness line.
export function LatestFeed({
  articles,
  density,
  newCount,
  onShowNew,
  sourcesMap,
  categoriesMap,
  onViewArticle,
}: LatestFeedProps) {
  const { t } = useTranslation();
  const newest = articles[0]?.published_at ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        {newest && (
          <p className="m-0 text-13 text-muted-foreground" role="status" aria-live="polite">
            {t('pages.news.updatedAgo', 'Updated {{time}}', { time: timeAgo(newest) })}
          </p>
        )}
        {newCount > 0 && (
          <button
            type="button"
            onClick={onShowNew}
            className="inline-flex items-center gap-2 rounded-element border border-foreground bg-background px-4 py-2 text-13 font-semibold hover:bg-foreground hover:text-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowUp size={14} aria-hidden="true" />
            {t('pages.news.showNNew', 'Show {{count}} new', { count: newCount })}
          </button>
        )}
      </div>

      {articles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('pages.news.emptyTitle', 'No articles yet.')}
        </p>
      ) : (
        <FeedGrid
          articles={articles}
          density={density}
          sourcesMap={sourcesMap}
          categoriesMap={categoriesMap}
          onViewArticle={onViewArticle}
        />
      )}
    </div>
  );
}
