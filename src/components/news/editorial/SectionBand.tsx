import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { NewsCard } from '@/components/news/NewsCard';
import { Separator } from '@/components/ui/separator';
import type { Tables } from '@/integrations/supabase/types';
import type { EntityImageAsset } from '@/hooks/useEntityImageAssets';
import type { NewsCategory } from '@/hooks/useNews';

type Article = Tables<'news_articles'> & { news_sources?: Tables<'news_sources'> };

interface SectionBandProps {
  category: NewsCategory;
  articles: Article[];
  sourcesMap?: Record<string, { id: string; name: string; url?: string }>;
  categoriesMap?: Record<string, NewsCategory>;
  assets?: Map<string, EntityImageAsset>;
  dek?: string;
}

export function SectionBand({
  category,
  articles,
  sourcesMap,
  categoriesMap,
  assets,
  dek,
}: SectionBandProps) {
  if (articles.length === 0) return null;
  const [hero, ...rest] = articles;
  const tail = rest.slice(0, 3);

  return (
    <section aria-labelledby={`section-${category.slug}-heading`} className="mb-16">
      <Separator className="mb-6" />
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Section
          </p>
          <h2
            id={`section-${category.slug}-heading`}
            className="m-0 text-display font-bold leading-none tracking-tight"
          >
            {category.name}
          </h2>
          {dek && (
            <p className="mt-3 text-15 italic text-muted-foreground max-w-xl leading-snug">
              {dek}
            </p>
          )}
        </div>
        <LocalizedLink
          to={`/news/all?category=${category.slug}`}
          className="text-13 uppercase tracking-wider whitespace-nowrap hover:underline no-underline text-foreground shrink-0"
        >
          View all →
        </LocalizedLink>
      </div>

      <NewsCard
        article={hero}
        variant="section-hero"
        sourcesMap={sourcesMap}
        categoriesMap={categoriesMap}
        imageAsset={assets?.get(hero.id)}
      />

      {tail.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
          {tail.map((article) => (
            <NewsCard
              key={article.id}
              article={article}
              sourcesMap={sourcesMap}
              categoriesMap={categoriesMap}
              imageAsset={assets?.get(article.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
