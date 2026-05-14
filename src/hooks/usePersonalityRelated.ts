import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RelatedNews {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  image_url: string | null;
  published_at: string;
  publisher_name: string | null;
}

export interface RelatedEvent {
  id: string;
  slug: string | null;
  title: string;
  start_at: string | null;
  image_url: string | null;
}

interface State {
  news: RelatedNews[];
  events: RelatedEvent[];
  loading: boolean;
}

/**
 * Fetch cross-entity content related to a personality.
 *
 * Strategy:
 *   - News: `ilike` match on title against the personality name OR tag array contains slug.
 *   - Events: same approach against `events.title` + tag overlap.
 *
 * Both queries are intentionally simple — no joins, no RPC. Results are
 * limited and ordered by recency. Failures degrade silently (empty array).
 */
export function usePersonalityRelated(name: string, slug?: string) {
  const [state, setState] = useState<State>({ news: [], events: [], loading: true });

  useEffect(() => {
    if (!name) return;
    let cancelled = false;

    (async () => {
      // Match either name in title (ilike) or slug in tags array.
      // PostgREST `or` syntax: `or=(title.ilike.*name*,tags.cs.{slug})`
      const nameLike = `*${name.replace(/[%,]/g, ' ')}*`;
      const orClause = slug
        ? `title.ilike.${nameLike},tags.cs.{${slug}}`
        : `title.ilike.${nameLike}`;

      const [newsRes, eventsRes] = await Promise.all([
        supabase
          .from('news_articles')
          .select('id,slug,title,excerpt,image_url,published_at,publisher_name')
          .or(orClause)
          .is('duplicate_of_id', null)
          .order('published_at', { ascending: false })
          .limit(6),
        supabase
          .from('events')
          .select('id,slug,title,start_at,image_url')
          .or(orClause.replace('published_at', 'start_at'))
          .order('start_at', { ascending: false })
          .limit(6),
      ]);

      if (cancelled) return;
      setState({
        news: (newsRes.data as RelatedNews[] | null) ?? [],
        events: (eventsRes.data as RelatedEvent[] | null) ?? [],
        loading: false,
      });
    })().catch(() => {
      if (!cancelled) setState((s) => ({ ...s, loading: false }));
    });

    return () => {
      cancelled = true;
    };
  }, [name, slug]);

  return state;
}
