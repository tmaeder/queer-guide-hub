import { useMemo, useState } from 'react';
import { NewsCard } from '@/components/news/NewsCard';
import { spansForPreset } from '@/components/discovery';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { NewsCategory } from '@/hooks/useNews';
import type { NewsDensity } from '@/hooks/useNewsDensity';

// Shared 12-column mosaic span classes for news grids. Lifted here so both the
// front-page feeds and NewsArchive render the same rhythm.
export const NEWS_SPAN_CLASS: Record<string, string> = {
  sm: 'col-span-12 md:col-span-6 xl:col-span-4',
  md: 'col-span-12 md:col-span-6 xl:col-span-4',
  lg: 'col-span-12 md:col-span-6 xl:col-span-6',
  wide: 'col-span-12 xl:col-span-8',
  tall: 'col-span-12 md:col-span-6 xl:col-span-4 row-span-2',
};

type Article = Record<string, unknown> & { id: string };

interface FeedGridProps {
  articles: Article[];
  sourcesMap?: Record<string, { id: string; name: string; url?: string }>;
  categoriesMap?: Record<string, NewsCategory>;
  tagsMap?: Record<string, string[]>;
  density?: NewsDensity;
  pageSize?: number;
  onViewArticle?: (id: string) => void;
}

// Presentational, windowed grid of default NewsCards with a Load-more control.
// Owns its own image-asset batch for the visible window.
export function FeedGrid({
  articles,
  sourcesMap = {},
  categoriesMap = {},
  tagsMap = {},
  density = 'comfortable',
  pageSize = 24,
  onViewArticle,
}: FeedGridProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const visibleCount = page * pageSize;
  const visible = articles.slice(0, visibleCount);
  const hasMore = articles.length > visibleCount;

  const visibleIds = useMemo(() => visible.map((a) => a.id), [visible]);
  const { assets } = useEntityImageAssets('news_article', visibleIds);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        {visible.map((article, i) => (
          <div
            key={article.id}
            className={NEWS_SPAN_CLASS[spansForPreset('mosaic', i, visible.length)]}
          >
            <NewsCard
              article={article as Parameters<typeof NewsCard>[0]['article']}
              density={density}
              onViewArticle={onViewArticle}
              sourcesMap={sourcesMap}
              categoriesMap={categoriesMap}
              tags={tagsMap[article.id] || []}
              imageAsset={assets.get(article.id)}
            />
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
            {t('pages.news.loadMore', 'Load more articles')}
          </Button>
        </div>
      )}
    </div>
  );
}
