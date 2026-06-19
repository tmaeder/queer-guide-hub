import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useNews } from '@/hooks/useNews';
import type { NewsCategory } from '@/hooks/useNews';
import { useNewsStories } from '@/hooks/useNewsStories';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useMeta } from '@/hooks/useMeta';
import { useEditorsPick } from '@/hooks/useEditorsPick';
import { useRealtimeNewsInserts } from '@/hooks/useRealtimeNewsInserts';
import { useFollowedTopics } from '@/hooks/useFollowedTopics';
import { usePersonalizedNews } from '@/hooks/usePersonalizedNews';
import { useNewsDensity } from '@/hooks/useNewsDensity';
import { useTopicLastVisit } from '@/hooks/useTopicLastVisit';
import { useUserTravelPreferences } from '@/hooks/useUserTravelPreferences';
import { formatNewsTag } from '@/lib/newsTags';
import type { Tables } from '@/integrations/supabase/types';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

import { IssueMasthead } from '@/components/news/editorial/IssueMasthead';
import { LeadStory } from '@/components/news/editorial/LeadStory';
import { AboveTheFold } from '@/components/news/editorial/AboveTheFold';
import { LiveTicker } from '@/components/news/editorial/LiveTicker';
import { StoryCollectionsBand } from '@/components/news/editorial/StoryCollectionsBand';
import { WeekInReview } from '@/components/news/editorial/WeekInReview';
import { ReaderRail } from '@/components/news/editorial/ReaderRail';
import { NewStoriesPill } from '@/components/news/editorial/NewStoriesPill';
import { NewsTabsBar, type NewsTab } from '@/components/news/feed/NewsTabsBar';
import {
  NewsControlBar,
  applyNewsControls,
  type NewsTopic,
  type NewsSort,
} from '@/components/news/feed/NewsControlBar';
import { ForYouFeed } from '@/components/news/feed/ForYouFeed';
import { LatestFeed } from '@/components/news/feed/LatestFeed';
import { TopicsBrowser } from '@/components/news/feed/TopicsBrowser';

type Article = Tables<'news_articles'> & { news_sources?: Tables<'news_sources'> };

const VALID_TABS: NewsTab[] = ['for-you', 'latest', 'topics'];

export default function News() {
  const { t } = useTranslation();
  const {
    articles,
    sources,
    categories,
    totalArticles,
    loading,
    getFeaturedArticles,
    fetchArticles,
    incrementViews,
  } = useNews();
  const { count: newCount, reset: resetNewCount } = useRealtimeNewsInserts();

  const handleRefreshNew = () => {
    void fetchArticles();
    resetNewCount();
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ---- Tab + controls state -------------------------------------------------
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: NewsTab = (VALID_TABS as string[]).includes(tabParam ?? '')
    ? (tabParam as NewsTab)
    : 'for-you';
  const setActiveTab = (tab: NewsTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'for-you') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: false });
  };

  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [sort, setSort] = useState<NewsSort>('latest');
  const { density, setDensity } = useNewsDensity();
  const { followed, isFollowed, toggle: toggleFollow } = useFollowedTopics();
  const { lastVisit, markVisited } = useTopicLastVisit();
  const { data: travelPrefs } = useUserTravelPreferences();

  const toggleTopicFilter = (slug: string) =>
    setSelectedTopics((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );

  const [featured, setFeatured] = useState<Article[]>([]);
  const editorsPick = useEditorsPick();

  useMeta({
    title: 'News',
    description:
      'LGBTQ+ news from around the world. A personalized, editorial-led front page with live updates, topic follows, and story collections.',
    canonicalPath: '/news',
  });

  useEffect(() => {
    if (loading) return;
    (async () => {
      const feat = await getFeaturedArticles();
      setFeatured(feat as Article[]);
    })();
  }, [loading, getFeaturedArticles]);

  const { stories, heroArticles: storyHeroes } = useNewsStories({ minArticles: 2, limit: 6 });

  // ---- Crown derivations (unchanged) ---------------------------------------
  const leadArticle: Article | undefined = featured[0];

  const topStory: Article | undefined = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- Date.now() computes a relative cutoff; recomputes when `articles` changes, the intended cadence.
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

  const lastUpdatedAt = useMemo(() => {
    let max = 0;
    let iso: string | null = null;
    for (const a of articles) {
      const ts = a.published_at ? new Date(a.published_at as string).getTime() : 0;
      if (ts > max) {
        max = ts;
        iso = a.published_at as string;
      }
    }
    return iso;
  }, [articles]);

  // ---- Topics + feed derivations -------------------------------------------
  // Trending news topics computed from the loaded articles' normalized tags —
  // guaranteed news-relevant (vs the global unified_tags catalog, which mixes in
  // venue/marketplace noise), and free (no extra query).
  const trendingNewsTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of articles) {
      for (const tag of ((a.tags as string[] | undefined) ?? [])) {
        const slug = String(tag).toLowerCase();
        counts.set(slug, (counts.get(slug) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([slug]) => slug);
  }, [articles]);

  const topics: NewsTopic[] = useMemo(() => {
    const seen = new Set<string>();
    const list: NewsTopic[] = [];
    for (const c of categories) {
      if (!seen.has(c.slug)) {
        seen.add(c.slug);
        list.push({ slug: c.slug, label: c.name });
      }
    }
    for (const slug of trendingNewsTags) {
      if (!seen.has(slug)) {
        seen.add(slug);
        list.push({ slug, label: formatNewsTag(slug) });
      }
    }
    return list.slice(0, 16);
  }, [categories, trendingNewsTags]);

  const candidates = articles as unknown as Array<Record<string, unknown> & { id: string }>;
  const { ranked, hasSignals } = usePersonalizedNews(candidates, followed);

  const forYouArticles = useMemo(
    () =>
      applyNewsControls(ranked, {
        selectedTopics,
        selectedCountry,
        sort: sort === 'most-read' ? 'most-read' : 'ranked',
      }),
    [ranked, selectedTopics, selectedCountry, sort],
  );

  const latestArticles = useMemo(
    () => applyNewsControls(candidates, { selectedTopics, selectedCountry, sort }),
    [candidates, selectedTopics, selectedCountry, sort],
  );

  const handleViewArticle = (id: string) => incrementViews(id);

  return (
    <div className="min-h-screen relative">
      <div className="container mx-auto px-4 pt-12 md:pt-16 pb-24">
        <IssueMasthead
          totalArticles={totalArticles ?? articles.length}
          sourceCount={sources.length}
          lastUpdatedAt={lastUpdatedAt}
        />

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-12 xl:gap-16">
          <main className="min-w-0">
            <NewStoriesPill count={newCount} onRefresh={handleRefreshNew} />

            {/* ── Editorial crown (always rendered, SEO-rich) ── */}
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

            {/* ── Tabs + sticky controls + feed body ── */}
            <NewsTabsBar value={activeTab} onChange={setActiveTab} />
            <NewsControlBar
              topics={topics}
              selectedTopics={selectedTopics}
              onToggleTopicFilter={toggleTopicFilter}
              isFollowed={isFollowed}
              onToggleFollow={toggleFollow}
              selectedCountry={selectedCountry}
              onCountryChange={setSelectedCountry}
              homeCountryId={travelPrefs?.home_country_id}
              sort={sort}
              onSortChange={setSort}
              density={density}
              onDensityChange={setDensity}
            />

            {activeTab === 'for-you' && (
              <ForYouFeed
                articles={forYouArticles}
                hasSignals={hasSignals}
                density={density}
                sourcesMap={sourcesMap}
                categoriesMap={categoriesMap}
                onViewArticle={handleViewArticle}
              />
            )}
            {activeTab === 'latest' && (
              <LatestFeed
                articles={latestArticles}
                density={density}
                newCount={newCount}
                onShowNew={handleRefreshNew}
                sourcesMap={sourcesMap}
                categoriesMap={categoriesMap}
                onViewArticle={handleViewArticle}
              />
            )}
            {activeTab === 'topics' && (
              <TopicsBrowser
                topics={topics}
                selectedTopics={selectedTopics}
                isFollowed={isFollowed}
                onToggleFollow={toggleFollow}
                onToggleFilter={toggleTopicFilter}
                articles={candidates}
                lastVisit={lastVisit}
                markVisited={markVisited}
                sectionCats={sectionCats}
                articlesByCategory={articlesByCategory}
                sourcesMap={sourcesMap}
                categoriesMap={categoriesMap}
                assets={assets}
              />
            )}

            {/* ── Shared editorial closers ── */}
            <div className="mt-16">
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
