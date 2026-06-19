import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { FeedGrid } from './FeedGrid';
import type { NewsCategory } from '@/hooks/useNews';
import type { NewsDensity } from '@/hooks/useNewsDensity';

type Article = Record<string, unknown> & { id: string };

interface ForYouFeedProps {
  articles: Article[];
  hasSignals: boolean;
  density: NewsDensity;
  sourcesMap?: Record<string, { id: string; name: string; url?: string }>;
  categoriesMap?: Record<string, NewsCategory>;
  onViewArticle?: (id: string) => void;
}

// Personalized feed. When the user has no signals yet, a quiet prompt invites
// them to follow topics (the chips live in the control bar above) — the feed
// still renders a sensible recency/popularity fallback beneath it.
export function ForYouFeed({
  articles,
  hasSignals,
  density,
  sourcesMap,
  categoriesMap,
  onViewArticle,
}: ForYouFeedProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      {!hasSignals && (
        <div className="flex items-start gap-3 rounded-container border border-border p-6">
          <Sparkles size={18} className="mt-0.5 text-accent-brand shrink-0" aria-hidden="true" />
          <div>
            <p className="m-0 font-semibold">
              {t('pages.news.forYouPromptTitle', 'Make this feed yours')}
            </p>
            <p className="m-0 mt-1 text-sm text-muted-foreground">
              {t(
                'pages.news.forYouPrompt',
                'Follow topics with the star on any chip above and we’ll build a feed around them.',
              )}
            </p>
          </div>
        </div>
      )}

      {articles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('pages.news.forYouEmpty', 'Nothing here yet. Try clearing a filter or following more topics.')}
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
