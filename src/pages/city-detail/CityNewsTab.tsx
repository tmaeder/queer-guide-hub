import { FileText } from 'lucide-react';
import { NewsCard } from '@/components/news/NewsCard';
import { InlineLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CityRelation, ArticleRelation } from './types';

export interface CityNewsTabProps {
  city: CityRelation;
  articles: ArticleRelation[];
  newsLoading: boolean;
}

export function CityNewsTab({ city, articles, newsLoading }: CityNewsTabProps) {
  return (
    <div className="mt-6">
      {newsLoading ? (
        <InlineLoading text="Loading news..." size="md" />
      ) : articles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {articles.slice(0, 6).map((article: ArticleRelation) => (
            <NewsCard key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No news available"
          description={`Check back later for news about ${city.name}!`}
          mood="neutral"
        />
      )}
    </div>
  );
}
