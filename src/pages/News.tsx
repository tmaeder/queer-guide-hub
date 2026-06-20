import { useMemo } from 'react';
import { useNews } from '@/hooks/useNews';
import type { NewsCategory } from '@/hooks/useNews';
import { useNewsFront } from '@/hooks/useNewsFront';
import { useNewsStories } from '@/hooks/useNewsStories';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useMeta } from '@/hooks/useMeta';
import { useEditorsPick } from '@/hooks/useEditorsPick';
import { useRealtimeNewsInserts } from '@/hooks/useRealtimeNewsInserts';
import type { Tables } from '@/integrations/supabase/types';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

import { IssueMasthead } from '@/components/news/editorial/IssueMasthead';
import { LeadStory } from '@/components/news/editorial/LeadStory';
import { AboveTheFold } from '@/components/news/editorial/AboveTheFold';
import { ForYouSection } from '@/components/news/editorial/ForYouSection';
import { LiveTicker } from '@/components/news/editorial/LiveTicker';
import { SectionBand } from '@/components/news/editorial/SectionBand';
import { StoryCollectionsBand } from '@/components/news/editorial/StoryCollectionsBand';
import { WeekInReview } from '@/components/news/editorial/WeekInReview';
import { ReaderRail } from '@/components/news/editorial/ReaderRail';
import { NewStoriesPill } from '@/components/news/editorial/NewStoriesPill';

type Article = Tables<'news_articles'> & { news_sources?: Tables<'news_sources'> };

// Section dek copy keyed by category slug. Falls back to the category description.
const SECTION_DEK: Record<string, string> = {
  rights: 'Law, politics, and the moving line of what queer people can do where.',
  pride: 'Marches, festivals, and the public face of community.',
  culture: 'Books, film, music, and how queer stories get told.',
  health: 'Bodies, minds, and the systems meant to care for them.',
  community: 'How queer people build, organize, and care for each other.',
};

export default function News() {
  const { t } = useTranslation();
  const {
    articles,
    sources,
    categories,
    totalArticles,
    fetchArticles,
  } = useNews();
  // Live, self-ranking front: hotness = recency × quality × soft featured boost
  // × trending. Replaces the old `is_featured` pin that left a months-old story
  // as the permanent headline. Auto-refreshes (poll + focus) so it never goes stale.
  const { articles: frontArticles, refetch: refetchFront } = useNewsFront(40);
  const { count: newCount, reset: resetNewCount } = useRealtimeNewsInserts();

  const handleRefreshNew = () => {
    void fetchArticles();
    void refetchFront();
    resetNewCount();
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const featured = frontArticles as unknown as Article[];
  const editorsPick = useEditorsPick();

  useMeta({
    title: 'News',
    description:
      'LGBTQ+ news from around the world. Editorial-led front page with live updates, sections, and story collections.',
    canonicalPath: '/news',
  });

  const { stories, heroArticles: storyHeroes } = useNewsStories({
    minArticles: 2,
    limit: 6,
  });

  // ---- Derivations ----------------------------------------------------------
  const leadArticle: Article | undefined = featured[0];

  const topStory: Article | undefined = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- Date.now() used inside useMemo to compute a relative cutoff; recomputes when `articles` changes which is the intended cadence.
    const twentyFourHrs = Date.now() - 24 * 60 * 60 * 1000;
    return [...articles]
      .filter(
        (a) =>
          a.id !== leadArticle?.id &&
          a.id !== editorsPick?.id &&
          a.published_at &&
          new Date(a.published_at as string).getTime() >= twentyFourHrs,
      )
      .sort((a, b) => (b.views_count ?? 0) - (a.views_count ?? 0))[0] as Article | undefined;
  }, [articles, leadArticle?.id, editorsPick?.id]);

  // Pick up to 4 sections from `categories`, skipping the lead/pick/topStory
  // categories aren't unique so we just take the first 4 active ones.
  const sectionCats = useMemo(() => categories.slice(0, 4), [categories]);

  const articlesByCategory = useMemo(() => {
    const map = new Map<string, Article[]>();
    const usedIds = new Set<string>(
      [leadArticle?.id, editorsPick?.id, topStory?.id].filter(Boolean) as string[],
    );
    for (const cat of sectionCats) {
      const matching = (articles as Article[]).filter((a) => {
        if (usedIds.has(a.id)) return false;
        const cc = (a as unknown as { category_canonical?: string }).category_canonical;
        return cc === cat.slug || a.category === cat.slug;
      });
      const slice = matching.slice(0, 4);
      slice.forEach((a) => usedIds.add(a.id));
      map.set(cat.slug, slice);
    }
    return map;
  }, [articles, sectionCats, leadArticle?.id, editorsPick?.id, topStory?.id]);

  // Image assets for everything visible above the section folds.
  const visibleIds = useMemo(() => {
    const ids = new Set<string>();
    if (leadArticle) ids.add(leadArticle.id);
    if (topStory) ids.add(topStory.id);
    if (editorsPick) ids.add(editorsPick.id);
    for (const arr of articlesByCategory.values()) arr.forEach((a) => ids.add(a.id));
    return Array.from(ids);
  }, [leadArticle, topStory, editorsPick, articlesByCategory]);
  const { assets } = useEntityImageAssets('news_article', visibleIds);

  const sourcesMap = useMemo(() => {
    const map: Record<string, { id: string; name: string; url?: string }> = {};
    sources.forEach((s) => {
      const src = s as { id: string; name: string; url?: string };
      map[src.id] = src;
    });
    return map;
  }, [sources]);

  const categoriesMap = useMemo(() => {
    const map: Record<string, NewsCategory> = {};
    categories.forEach((c) => {
      map[c.slug] = c;
    });
    return map;
  }, [categories]);

  const tickerArticles = useMemo(() => {
    return [...articles]
      .sort(
        (a, b) =>
          new Date((b.published_at ?? 0) as string).getTime() -
          new Date((a.published_at ?? 0) as string).getTime(),
      )
      .slice(0, 30) as unknown as Pick<
      Tables<'news_articles'>,
      'id' | 'slug' | 'title' | 'published_at'
    >[];
  }, [articles]);

  return (
    <div className="min-h-screen relative">
      <div className="container mx-auto px-4 pt-12 md:pt-16 pb-24">
        <IssueMasthead
          totalArticles={totalArticles ?? articles.length}
          sourceCount={sources.length}
        />

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-12 xl:gap-16">
          <main className="min-w-0">
            <NewStoriesPill count={newCount} onRefresh={handleRefreshNew} />
            <LeadStory
              article={leadArticle}
              sourcesMap={sourcesMap}
              categoriesMap={categoriesMap}
              imageAsset={leadArticle ? assets.get(leadArticle.id) : undefined}
            />

            <LiveTicker articles={tickerArticles} />

            <AboveTheFold
              topStory={topStory}
              editorsPick={editorsPick ?? undefined}
              sourcesMap={sourcesMap}
              categoriesMap={categoriesMap}
              assets={assets}
            />

            <ForYouSection
              sourcesMap={sourcesMap}
              categoriesMap={categoriesMap}
              excludeIds={[leadArticle?.id, topStory?.id, editorsPick?.id].filter(Boolean) as string[]}
            />

            {sectionCats.map((cat) => {
              const items = articlesByCategory.get(cat.slug) ?? [];
              if (items.length === 0) return null;
              return (
                <SectionBand
                  key={cat.id}
                  category={cat}
                  articles={items}
                  sourcesMap={sourcesMap}
                  categoriesMap={categoriesMap}
                  assets={assets}
                  dek={SECTION_DEK[cat.slug] ?? cat.description ?? undefined}
                />
              );
            })}

            {stories.length > 0 && (
              <StoryCollectionsBand
                stories={stories as Parameters<typeof StoryCollectionsBand>[0]['stories']}
                heroes={storyHeroes as Parameters<typeof StoryCollectionsBand>[0]['heroes']}
              />
            )}

            <WeekInReview articles={articles as Article[]} sourceCount={sources.length} />

            <div className="border-t border-border pt-8 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
              <div>
                <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">
                  Looking for more?
                </p>
                <p className="text-base mt-1 m-0">
                  The full archive has every story, every filter.
                </p>
              </div>
              <LocalizedLink to="/news/all" className="no-underline">
                <Button variant="outline" className="gap-2">
                  {t('pages.news.openArchive', 'Open archive')}
                  <ArrowRight size={16} />
                </Button>
              </LocalizedLink>
            </div>
          </main>

          <aside className="hidden xl:block sticky top-24 self-start">
            <ReaderRail />
          </aside>
        </div>
      </div>
    </div>
  );
}
