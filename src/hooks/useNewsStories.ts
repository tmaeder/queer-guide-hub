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

interface NewsStoriesResult {
  stories: NewsStory[];
  heroArticles: Record<string, NewsStoryArticle>;
}

async function fetchNewsStories(minArticles: number, limit: number): Promise<NewsStoriesResult> {
  const { data, error } = (await untypedFrom('news_stories')
    .select(
      'id, slug, title, summary, hero_article_id, article_count, first_seen_at, last_updated_at, top_tags, country_ids',
    )
    .gte('article_count', minArticles)
    .order('last_updated_at', { ascending: false })
    .limit(limit)) as unknown as { data: NewsStory[] | null; error: { message: string } | null };

  if (error) throw new Error(error.message);

  const stories = data ?? [];
  const heroIds = stories
    .map((story) => story.hero_article_id)
    .filter((id): id is string => Boolean(id));
  if (heroIds.length === 0) return { stories, heroArticles: {} };

  const { data: articles } = (await supabase
    .from('news_articles')
    .select(
      'id, title, slug, url, image_url, excerpt, published_at, source_id, views_count, category, category_canonical',
    )
    .in('id', heroIds)) as unknown as { data: NewsStoryArticle[] | null };

  return {
    stories,
    heroArticles: Object.fromEntries((articles ?? []).map((article) => [article.id, article])),
  };
}

export function useNewsStories(opts: { minArticles?: number; limit?: number } = {}) {
  const { minArticles = 2, limit = 50 } = opts;
  const query = useQuery({
    queryKey: ['news-stories', minArticles, limit],
    queryFn: () => fetchNewsStories(minArticles, limit),
  });

  return {
    stories: query.data?.stories ?? [],
    heroArticles: query.data?.heroArticles ?? {},
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: query.refetch,
  };
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
