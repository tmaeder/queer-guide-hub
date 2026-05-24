import { NewsCard } from '@/components/news/NewsCard';
import type { Tables } from '@/integrations/supabase/types';
import type { EntityImageAsset } from '@/hooks/useEntityImageAssets';
import type { NewsCategory } from '@/hooks/useNews';

type Article = Tables<'news_articles'> & { news_sources?: Tables<'news_sources'> };

interface LeadStoryProps {
  article?: Article;
  sourcesMap?: Record<string, { id: string; name: string; url?: string }>;
  categoriesMap?: Record<string, NewsCategory>;
  imageAsset?: EntityImageAsset;
}

export function LeadStory({ article, sourcesMap, categoriesMap, imageAsset }: LeadStoryProps) {
  if (!article) return null;
  return (
    <section aria-labelledby="lead-story-heading" className="mb-12">
      <h2 id="lead-story-heading" className="sr-only">
        Lead story
      </h2>
      <NewsCard
        article={article}
        variant="lead"
        priority
        sourcesMap={sourcesMap}
        categoriesMap={categoriesMap}
        imageAsset={imageAsset}
      />
    </section>
  );
}
