import { NewsCard } from '@/components/news/NewsCard';
import type { ArticleRelation } from './types';

export interface CityNewsTabProps {
  articles: ArticleRelation[];
}

/**
 * Rule 2: no empty state. The old version rendered "No news available — check
 * back later" for every city with no coverage, which is 2,200 of 3,070. The
 * page now simply has no news section for those.
 */
export function CityNewsTab({ articles }: CityNewsTabProps) {
  if (articles.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {articles.slice(0, 6).map((article: ArticleRelation) => (
        <NewsCard key={article.id} article={article} />
      ))}
    </div>
  );
}
