import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';

/**
 * Data for the public podcast surface.
 *
 * The model is deliberately thin: a SHOW is a `news_sources` row with
 * `feed_type='podcast'`, an EPISODE is a `news_articles` row with
 * `media_type='podcast'`. There is no podcast table and no second URL space —
 * episodes keep their existing `/news/:slug` pages, which is what stops a
 * canonical fight with the 8,000+ episode URLs already indexed.
 *
 * `untypedFrom` because slug / description / website_url / episode_count are
 * newer than the last `supabase gen types` run.
 *
 * These live in src/hooks/ because the `supabase.from()` lint rule confines
 * every query to this directory.
 */

export interface PodcastShow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** The show's own website (channel <link>) — NOT the feed URL. */
  website_url: string | null;
  /** The RSS feed itself. Rendered as the "subscribe in your app" link. */
  url: string | null;
  artwork_url: string | null;
  episode_count: number;
}

export interface PodcastEpisode {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  image_url: string | null;
  published_at: string;
  audio_url: string | null;
  duration_seconds: number | null;
  media_type: string | null;
  source_id: string | null;
  author: string | null;
}

const SHOW_COLS = 'id, name, slug, description, website_url, url, artwork_url, episode_count';
const EPISODE_COLS =
  'id, slug, title, excerpt, image_url, published_at, audio_url, duration_seconds, media_type, source_id, author';

const STALE = 5 * 60 * 1000;

/**
 * Shows with at least one episode, most episodes first.
 *
 * `episode_count > 0` is not cosmetic: 66 of 265 shows have never committed an
 * episode, and publishing an empty show page is the thin-content shape that
 * gets a whole URL space discounted. The same predicate gates the crawler hub
 * body and sitemap-podcasts.xml, and the three must agree.
 */
export function usePodcastShows() {
  return useQuery<PodcastShow[]>({
    queryKey: ['podcast-shows'],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await untypedFrom('news_sources')
        .select(SHOW_COLS)
        .eq('feed_type', 'podcast')
        .eq('is_active', true)
        .gt('episode_count', 0)
        .order('episode_count', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PodcastShow[];
    },
  });
}

export function usePodcastShow(slug: string | undefined) {
  return useQuery<PodcastShow | null>({
    queryKey: ['podcast-show', slug],
    enabled: Boolean(slug),
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await untypedFrom('news_sources')
        .select(SHOW_COLS)
        .eq('slug', slug!)
        .eq('feed_type', 'podcast')
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as PodcastShow | null;
    },
  });
}

/**
 * Episodes of one show, newest first.
 *
 * The visibility predicate is copied from `useNews.fetchArticles` rather than
 * simplified: an article is public when quality_status is 'passed', or is null
 * with a quality_score that is null or >= 50. Anything looser publishes rows
 * the news pipeline rejected; anything tighter hides the ~2/3 of the corpus
 * that predates quality_status.
 */
export function usePodcastEpisodes(sourceId: string | undefined, limit = 100) {
  return useQuery<PodcastEpisode[]>({
    queryKey: ['podcast-episodes', sourceId, limit],
    enabled: Boolean(sourceId),
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await untypedFrom('news_articles')
        .select(EPISODE_COLS)
        .eq('source_id', sourceId!)
        .eq('media_type', 'podcast')
        .or(
          'quality_status.eq.passed,and(quality_status.is.null,or(quality_score.is.null,quality_score.gte.50))',
        )
        .is('duplicate_of_id', null)
        .is('archived_at', null)
        .order('published_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as PodcastEpisode[];
    },
  });
}

/** Newest episodes across every show — the hub's "latest" strip. */
export function useLatestEpisodes(limit = 12) {
  return useQuery<PodcastEpisode[]>({
    queryKey: ['podcast-latest', limit],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await untypedFrom('news_articles')
        .select(EPISODE_COLS)
        .eq('media_type', 'podcast')
        .not('audio_url', 'is', null)
        .or(
          'quality_status.eq.passed,and(quality_status.is.null,or(quality_score.is.null,quality_score.gte.50))',
        )
        .is('duplicate_of_id', null)
        .is('archived_at', null)
        .order('published_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as PodcastEpisode[];
    },
  });
}
