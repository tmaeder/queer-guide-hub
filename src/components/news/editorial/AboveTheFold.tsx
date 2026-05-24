import { NewsCard } from '@/components/news/NewsCard';
import type { Tables } from '@/integrations/supabase/types';
import type { EntityImageAsset } from '@/hooks/useEntityImageAssets';
import type { NewsCategory } from '@/hooks/useNews';

type Article = Tables<'news_articles'> & { news_sources?: Tables<'news_sources'> };

interface AboveTheFoldProps {
  topStory?: Article;
  editorsPick?: Article;
  sourcesMap?: Record<string, { id: string; name: string; url?: string }>;
  categoriesMap?: Record<string, NewsCategory>;
  assets?: Map<string, EntityImageAsset>;
}

function Column({
  label,
  article,
  sourcesMap,
  categoriesMap,
  asset,
}: {
  label: string;
  article: Article;
  sourcesMap?: Record<string, { id: string; name: string; url?: string }>;
  categoriesMap?: Record<string, NewsCategory>;
  asset?: EntityImageAsset;
}) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground border-t border-foreground pt-4 mb-4">
        {label}
      </p>
      <NewsCard
        article={article}
        variant="section-hero"
        sourcesMap={sourcesMap}
        categoriesMap={categoriesMap}
        imageAsset={asset}
      />
    </div>
  );
}

export function AboveTheFold({
  topStory,
  editorsPick,
  sourcesMap,
  categoriesMap,
  assets,
}: AboveTheFoldProps) {
  if (!topStory && !editorsPick) return null;
  return (
    <section aria-labelledby="above-fold-heading" className="mb-16">
      <h2 id="above-fold-heading" className="sr-only">
        Above the fold
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
        {topStory && (
          <Column
            label="Top story"
            article={topStory}
            sourcesMap={sourcesMap}
            categoriesMap={categoriesMap}
            asset={assets?.get(topStory.id)}
          />
        )}
        {editorsPick && (
          <Column
            label="Editor’s pick"
            article={editorsPick}
            sourcesMap={sourcesMap}
            categoriesMap={categoriesMap}
            asset={assets?.get(editorsPick.id)}
          />
        )}
      </div>
    </section>
  );
}
