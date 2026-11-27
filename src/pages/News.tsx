import { useMemo } from 'react';
import { useNewsArticles, useNewsCategories, useNewsSources } from '@/hooks/useNews';
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
import { ArrowRight } from '@/components/icons';

import { IssueMasthead } from '@/components/news/editorial/IssueMasthead';
import { LeadStory } from '@/components/news/editorial/LeadStory';
import { AboveTheFold } from '@/components/news/editorial/AboveTheFold';
import { ForYouSection } from '@/components/news/editorial/ForYouSection';
import { SectionBand } from '@/components/news/editorial/SectionBand';
import { StoryCollectionsBand } from '@/components/news/editorial/StoryCollectionsBand';
import { WeekInReview } from '@/components/news/editorial/WeekInReview';
import { ReaderRail } from '@/components/news/editorial/ReaderRail';
import { useAuth } from '@/hooks/useAuth';
import { NewStoriesPill } from '@/components/news/editorial/NewStoriesPill';
import { DeferredSection } from '@/components/home/DeferredSection';
import { PageContainer, STICKY_RAIL_UNDER_HEADER } from '@/components/layout/PageContainer';

type Article = Tables<'news_articles'> & { news_sources?: Tables<'news_sources'> };

// Stable key for the unfiltered list the front page renders.
const ALL_ARTICLES = {};

export default function News() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const {
    articles,
    loading: articlesLoading,
    refetch: refetchArticles,
  } = useNewsArticles(ALL_ARTICLES);
  const sources = useNewsSources();
  const categories = useNewsCategories();
  // Live, self-ranking front: hotness = recency × quality × soft featured boost
  // × trending. Replaces the old `is_featured` pin that left a months-old story
  // as the permanent headline. Auto-refreshes (poll + focus) so it never goes stale.
  const {
    articles: frontArticles,
    loading: frontLoading,
    refetch: refetchFront,
  } = useNewsFront(40);
  const { count: newCount, reset: resetNewCount } = useRealtimeNewsInserts();

  const handleRefreshNew = () => {
    void refetchArticles();
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

  return (
    <div className="min-h-screen relative">
      <PageContainer>
        <IssueMasthead />

        <div
          className={`grid grid-cols-1 gap-12 xl:gap-16 ${user ? 'xl:grid-cols-[1fr_320px]' : ''}`}
        >
          <div className="min-w-0">
            <NewStoriesPill count={newCount} onRefresh={handleRefreshNew} />
            {/* Reserve the lead's space while the front feed loads; the bands below
                otherwise paint first and are pushed down when it arrives. */}
            {frontLoading && !leadArticle ? (
              <div
                aria-hidden="true"
                className="mb-12 min-h-[200px] rounded-panel bg-muted md:min-h-[520px]"
              />
            ) : (
              <LeadStory
                article={leadArticle}
                sourcesMap={sourcesMap}
                categoriesMap={categoriesMap}
                imageAsset={leadArticle ? assets.get(leadArticle.id) : undefined}
              />
            )}

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
              excludeIds={
                [leadArticle?.id, topStory?.id, editorsPick?.id].filter(Boolean) as string[]
              }
            />

            {/* Everything below For You mounts on approach: rendering every band
                in one pass at load was ~1 s of mobile main thread (TBT). */}
            <DeferredSection rootMargin="400px 0px">
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
                    dek={cat.description ?? undefined}
                  />
                );
              })}

              {!articlesLoading && stories.length > 0 && (
                <StoryCollectionsBand
                  stories={stories as Parameters<typeof StoryCollectionsBand>[0]['stories']}
                  heroes={storyHeroes as Parameters<typeof StoryCollectionsBand>[0]['heroes']}
                />
              )}

              <WeekInReview articles={articles as Article[]} />

              {/* An ink plate rather than a footnote: the archive is the
                  invitation to keep reading, so it gets the page's loudest band.
                  Held back while articles load: every band above renders
                  nothing until then, so it would paint near the top and then be
                  pushed ~1,000px down (CLS 0.8-1.2 on /news). */}
              {!articlesLoading && (
                <div className="flex flex-col gap-6 rounded-panel bg-foreground p-8 text-background md:flex-row md:items-end md:justify-between md:p-12">
                  <div className="max-w-reading">
                    <p className="m-0 text-2xs uppercase tracking-label text-background/70">
                      {t('pages.news.archiveEyebrow', 'Keep reading')}
                    </p>
                    <p className="m-0 mt-2 font-display text-display leading-none">
                      {t('pages.news.archiveTitle', 'Every story we have ever told.')}
                    </p>
                    <p className="m-0 mt-4 text-body-lg text-background/80">
                      {t(
                        'pages.news.archiveBody',
                        'Rights won, rights fought for, nights out and the people who made them. Search the full archive by topic, place or date.',
                      )}
                    </p>
                  </div>
                  <Button asChild variant="accent" className="shrink-0 gap-2">
                    <LocalizedLink to="/news/all" className="no-underline">
                      {t('pages.news.openArchive', 'Open archive')}
                      <ArrowRight size={16} />
                    </LocalizedLink>
                  </Button>
                </div>
              )}
            </DeferredSection>
          </div>

          {user && (
            <aside className={`hidden xl:block sticky ${STICKY_RAIL_UNDER_HEADER} self-start`}>
              <ReaderRail />
            </aside>
          )}
        </div>
      </PageContainer>
    </div>
  );
}
