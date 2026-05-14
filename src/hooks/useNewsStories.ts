import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
    const { data, error: err } = await supabase
      .from('news_stories' as never)
      .select('id, slug, title, summary, hero_article_id, article_count, first_seen_at, last_updated_at, top_tags, country_ids')
      .gte('article_count', minArticles)
      .order('last_updated_at', { ascending: false })
      .limit(limit) as unknown as { data: NewsStory[] | null; error: { message: string } | null };

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const rows = data ?? [];
    setStories(rows);

    const heroIds = rows.map((r) => r.hero_article_id).filter((x): x is string => !!x);
    if (heroIds.length > 0) {
      const { data: arts } = await supabase
        .from('news_articles')
        .select('id, title, slug, url, image_url, excerpt, published_at, source_id, views_count, category, category_canonical')
        .in('id', heroIds) as unknown as { data: NewsStoryArticle[] | null };
      const map: Record<string, NewsStoryArticle> = {};
      (arts ?? []).forEach((a) => { map[a.id] = a; });
      setHeroArticles(map);
    } else {
      setHeroArticles({});
    }
    setLoading(false);
  }, [minArticles, limit]);

  useEffect(() => { fetchStories(); }, [fetchStories]);

  return { stories, heroArticles, loading, error, refetch: fetchStories };
}

export interface StoryDetail extends NewsStory {
  articles: NewsStoryArticle[];
}

export async function fetchStoryBySlug(slug: string): Promise<StoryDetail | null> {
  const { data: story } = await supabase
    .from('news_stories' as never)
    .select('id, slug, title, summary, hero_article_id, article_count, first_seen_at, last_updated_at, top_tags, country_ids')
    .eq('slug', slug)
    .maybeSingle() as unknown as { data: NewsStory | null };
  if (!story) return null;

  const { data: links } = await supabase
    .from('news_story_articles' as never)
    .select('article_id')
    .eq('story_id', story.id) as unknown as { data: { article_id: string }[] | null };
  const ids = (links ?? []).map((l) => l.article_id);
  if (ids.length === 0) return { ...story, articles: [] };

  const { data: arts } = await supabase
    .from('news_articles')
    .select('id, title, slug, url, image_url, excerpt, published_at, source_id, views_count, category, category_canonical')
    .in('id', ids)
    .order('published_at', { ascending: false }) as unknown as { data: NewsStoryArticle[] | null };

  return { ...story, articles: arts ?? [] };
}

export async function fetchStoryForArticle(articleId: string): Promise<{ slug: string; title: string; article_count: number } | null> {
  const { data: link } = await supabase
    .from('news_story_articles' as never)
    .select('story_id')
    .eq('article_id', articleId)
    .maybeSingle() as unknown as { data: { story_id: string } | null };
  if (!link) return null;

  const { data: story } = await supabase
    .from('news_stories' as never)
    .select('slug, title, article_count')
    .eq('id', link.story_id)
    .maybeSingle() as unknown as { data: { slug: string; title: string; article_count: number } | null };
  if (!story || story.article_count < 2) return null;
  return story;
}
