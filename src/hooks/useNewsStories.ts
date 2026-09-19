import { useEffect, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/untyped';

export interface NewsStory {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  hero_article_id: string | null;
  article_count: number;
  first_seen_at: string;
  last_updated_at: string;
  top_tags: string[];
  country_ids: string[];
}

export interface NewsStoryArticle {
  id: string;
  title: string;
  slug: string;
  url: string;
  image_url: string | null;
  excerpt: string | null;
  published_at: string;
  source_id: string;
  views_count: number | null;
  category: string | null;
  category_canonical: string | null;
}

export function useNewsStories(opts: { minArticles?: number; limit?: number } = {}) {
  const { minArticles = 2, limit = 50 } = opts;
  const [stories, setStories] = useState<NewsStory[]>([]);
  const [heroArticles, setHeroArticles] = useState<Record<string, NewsStoryArticle>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStories = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = (await untypedFrom('news_stories')
      .select(
        'id, slug, title, summary, hero_article_id, article_count, first_seen_at, last_updated_at, top_tags, country_ids',
      )
      .gte('article_count', minArticles)
      .order('last_updated_at', { ascending: false })
      .limit(limit)) as unknown as { data: NewsStory[] | null; error: { message: string } | null };

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const rows = data ?? [];
    setStories(rows);

    const heroIds = rows.map((r) => r.hero_article_id).filter((x): x is string => !!x);
    if (heroIds.length > 0) {
      const { data: arts } = (await supabase
        .from('news_articles')
        .select(
          'id, title, slug, url, image_url, excerpt, published_at, source_id, views_count, category, category_canonical',
        )
        .in('id', heroIds)) as unknown as { data: NewsStoryArticle[] | null };
      const map: Record<string, NewsStoryArticle> = {};
      (arts ?? []).forEach((a) => {
        map[a.id] = a;
      });
      setHeroArticles(map);
    } else {
      setHeroArticles({});
    }
    setLoading(false);
  }, [minArticles, limit]);

   
  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  return { stories, heroArticles, loading, error, refetch: fetchStories };
}

export interface StoryDetail extends NewsStory {
  articles: NewsStoryArticle[];
}

export async function fetchStoryBySlug(slug: string): Promise<StoryDetail | null> {
  const { data: story } = (await untypedFrom('news_stories')
    .select(
      'id, slug, title, summary, hero_article_id, article_count, first_seen_at, last_updated_at, top_tags, country_ids',
    )
    .eq('slug', slug)
    .maybeSingle()) as unknown as { data: NewsStory | null };
  if (!story) return null;

  const { data: links } = (await untypedFrom('news_story_articles')
    .select('article_id')
    .eq('story_id', story.id)) as unknown as { data: { article_id: string }[] | null };
  const ids = (links ?? []).map((l) => l.article_id);
  if (ids.length === 0) return { ...story, articles: [] };

  const { data: arts } = (await supabase
    .from('news_articles')
    .select(
      'id, title, slug, url, image_url, excerpt, published_at, source_id, views_count, category, category_canonical',
    )
    .in('id', ids)
    .order('published_at', { ascending: false })) as unknown as { data: NewsStoryArticle[] | null };

  return { ...story, articles: arts ?? [] };
}

export async function fetchStoryForArticle(
  articleId: string,
): Promise<{ slug: string; title: string; article_count: number } | null> {
  const { data: link } = (await untypedFrom('news_story_articles')
    .select('story_id')
    .eq('article_id', articleId)
    .maybeSingle()) as unknown as { data: { story_id: string } | null };
  if (!link) return null;

  const { data: story } = (await untypedFrom('news_stories')
    .select('slug, title, article_count')
    .eq('id', link.story_id)
    .maybeSingle()) as unknown as {
    data: { slug: string; title: string; article_count: number } | null;
  };
  if (!story || story.article_count < 2) return null;
  return story;
}

/**
 * Full story cluster for an article — the other outlets covering the same event.
 * Resolves the article's story_id, then loads every member article so the news
 * detail page can render a "Reported by N outlets" panel. Returns null when the
 * article isn't part of a multi-source cluster.
 */
export async function fetchStoryClusterForArticle(articleId: string): Promise<StoryDetail | null> {
  const { data: link } = (await untypedFrom('news_story_articles')
    .select('story_id')
    .eq('article_id', articleId)
    .maybeSingle()) as unknown as { data: { story_id: string } | null };
  if (!link) return null;

  const { data: story } = (await untypedFrom('news_stories')
    .select(
      'id, slug, title, summary, hero_article_id, article_count, first_seen_at, last_updated_at, top_tags, country_ids',
    )
    .eq('id', link.story_id)
    .maybeSingle()) as unknown as { data: NewsStory | null };
  if (!story || story.article_count < 2) return null;

  const { data: links } = (await untypedFrom('news_story_articles')
    .select('article_id')
    .eq('story_id', story.id)) as unknown as { data: { article_id: string }[] | null };
  const ids = (links ?? []).map((l) => l.article_id);
  if (ids.length === 0) return { ...story, articles: [] };

  const { data: arts } = (await supabase
    .from('news_articles')
    .select(
      'id, title, slug, url, image_url, excerpt, published_at, source_id, views_count, category, category_canonical',
    )
    .in('id', ids)
    .order('published_at', { ascending: false })) as unknown as { data: NewsStoryArticle[] | null };

  return { ...story, articles: arts ?? [] };
}

/**
 * How many articles each of the given articles' clusters holds — the data
 * behind a "6 outlets" marker on a card.
 *
 * Every eligible article is clustered (measured: 1,472 of 1,472 in a 21-day
 * window), but only ~266 clusters hold more than one article, so the marker is
 * rendered for roughly one row in five and the rest get nothing.
 *
 * BOUNDED BY `.in()`, deliberately. The sibling query in `useNews.tsx` selects
 * the same shape with no filter and pulls every link row in the table; this one
 * is called from the homepage on every visit and must cost one small request.
 * `news_story_articles` is anon-SELECT granted and the embed resolves through
 * `news_story_articles_story_id_fkey` (verified against the live catalog).
 *
 * The primary key is `(story_id, article_id)` and there is NO unique index on
 * `article_id` alone, so an article may in principle appear in two clusters.
 * Measured on prod it appears in exactly zero, but "0 today" is not a
 * constraint — so the fold below keeps the LARGEST count rather than whichever
 * row PostgREST happens to return last, which would make the marker
 * nondeterministic the day clustering changes.
 */
export function useStoryCountsForArticles(articleIds: string[]) {
  // Sort so two renders with the same ids in a different order share a cache
  // entry rather than refetching.
  const key = [...articleIds].sort();
  const query = useQuery({
    queryKey: ['story-counts', key],
    enabled: key.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = (await untypedFrom('news_story_articles')
        .select('article_id, news_stories(slug, article_count)')
        .in('article_id', key)) as unknown as {
        data: Array<{
          article_id: string;
          news_stories: { slug: string; article_count: number } | null;
        }> | null;
      };
      const map = new Map<string, { slug: string; count: number }>();
      for (const row of data ?? []) {
        // A single-article cluster is not a corroboration signal; drop it here
        // so no caller has to remember the >= 2 rule.
        if (!row.news_stories || row.news_stories.article_count < 2) continue;
        const seen = map.get(row.article_id);
        if (seen && seen.count >= row.news_stories.article_count) continue;
        map.set(row.article_id, {
          slug: row.news_stories.slug,
          count: row.news_stories.article_count,
        });
      }
      return map;
    },
  });
  // ponytail: article_count counts ARTICLES, not distinct outlets. The copy
  // says "N outlets" because in this corpus a cluster is one story picked up by
  // several publishers — count distinct source_id if that ever stops holding.
  return query.data ?? new Map<string, { slug: string; count: number }>();
}
