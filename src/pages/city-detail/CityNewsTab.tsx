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
  if (newsLoading) return <InlineLoading text="Loading news..." size="md" />;
  if (articles.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No news available"
        description={`Check back later for news about ${city.name}!`}
        mood="neutral"
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {articles.slice(0, 6).map((article: ArticleRelation) => (
        <NewsCard key={article.id} article={article} />
      ))}
    </div>
  );
}
