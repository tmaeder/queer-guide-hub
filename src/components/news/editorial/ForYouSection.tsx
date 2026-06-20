import { useMemo } from 'react';
import { NewsCard } from '@/components/news/NewsCard';
import { Separator } from '@/components/ui/separator';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useForYouNews } from '@/hooks/useNewsFront';
import type { Tables } from '@/integrations/supabase/types';
import type { NewsCategory } from '@/hooks/useNews';

type Article = Tables<'news_articles'>;

interface ForYouSectionProps {
  sourcesMap?: Record<string, { id: string; name: string; url?: string }>;
  categoriesMap?: Record<string, NewsCategory>;
  /** Article ids already shown above (lead/top/pick) so For You doesn't repeat them. */
  excludeIds?: string[];
}

/**
 * Personalized "For You" band — only rendered for signed-in users with at
 * least a couple of interest/geo matches. Ranked server-side by the
 * personalized score (followed tags + interests boosted, already-read demoted).
 */
export function ForYouSection({ sourcesMap, categoriesMap, excludeIds = [] }: ForYouSectionProps) {
  const { articles } = useForYouNews(8);

  const items = useMemo(() => {
    const exclude = new Set(excludeIds);
    return articles.filter((a) => !exclude.has(a.id)).slice(0, 4);
  }, [articles, excludeIds]);

  const ids = useMemo(() => items.map((a) => a.id), [items]);
  const { assets } = useEntityImageAssets('news_article', ids);

  // Need a real signal to justify a personalized rail — one match looks broken.
  if (items.length < 2) return null;

  const [hero, ...rest] = items as unknown as Article[];

  return (
    <section aria-labelledby="for-you-heading" className="mb-16">
      <Separator className="mb-6" />
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground mb-2">For you</p>
          <h2
            id="for-you-heading"
            className="m-0 text-display font-bold leading-none tracking-tight"
          >
            Picked for you
          </h2>
          <p className="mt-2 text-15 italic text-muted-foreground max-w-xl leading-snug">
            Based on the tags and topics you follow.
          </p>
        </div>
        <LocalizedLink
          to="/me"
          className="text-13 uppercase tracking-wider whitespace-nowrap hover:underline no-underline text-foreground shrink-0"
        >
          Tune interests →
        </LocalizedLink>
      </div>

      <NewsCard
        article={hero}
        variant="section-hero"
        sourcesMap={sourcesMap}
        categoriesMap={categoriesMap}
        imageAsset={assets.get(hero.id)}
      />

      {rest.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
          {rest.map((article) => (
            <NewsCard
              key={article.id}
              article={article}
              sourcesMap={sourcesMap}
              categoriesMap={categoriesMap}
              imageAsset={assets.get(article.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
