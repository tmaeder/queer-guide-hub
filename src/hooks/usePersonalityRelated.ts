import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/untyped';

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
  start_date: string | null;
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
 * Only reviewed/applied entity links are public. Title substring matching was
 * removed because namesakes and incidental mentions produced false relations.
 */
export function usePersonalityRelated(personalityId: string) {
  const [state, setState] = useState<State>({ news: [], events: [], loading: true });

  useEffect(() => {
    if (!personalityId) return;
    let cancelled = false;

    (async () => {
      const [newsRes, eventsRes] = await Promise.all([
        supabase
          .from('news_article_entities')
          .select(
            'news_articles!inner(id,slug,title,excerpt,image_url,published_at,publisher_name,duplicate_of_id)',
          )
          .eq('entity_type', 'personality')
          .eq('entity_id', personalityId)
          .is('news_articles.duplicate_of_id', null)
          .limit(12),
        untypedFrom('event_personality_links')
          .select('events!inner(id,slug,title,start_date,images,logo_url)')
          .eq('personality_id', personalityId)
          .eq('status', 'approved')
          .limit(12),
      ]);

      if (cancelled) return;
      type EventRow = {
        id: string;
        slug: string | null;
        title: string;
        start_date: string | null;
        images: string[] | null;
        logo_url: string | null;
      };
      type EventLinkRow = { events: EventRow | EventRow[] | null };
      type NewsLinkRow = { news_articles: RelatedNews | RelatedNews[] | null };
      const one = <T>(value: T | T[] | null): T | null =>
        Array.isArray(value) ? (value[0] ?? null) : value;
      const news = ((newsRes.data as unknown as NewsLinkRow[] | null) ?? [])
        .map((row) => one(row.news_articles))
        .filter((row): row is RelatedNews => Boolean(row))
        .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
        .slice(0, 6);
      const events: RelatedEvent[] = ((eventsRes.data as unknown as EventLinkRow[] | null) ?? [])
        .map((row) => one(row.events))
        .filter((row): row is EventRow => Boolean(row))
        .sort((a, b) => Date.parse(b.start_date ?? '') - Date.parse(a.start_date ?? ''))
        .slice(0, 6)
        .map((e) => ({
          id: e.id,
          slug: e.slug,
          title: e.title,
          start_date: e.start_date,
          image_url: e.images?.[0] ?? e.logo_url ?? null,
        }));
      setState({
        news,
        events,
        loading: false,
      });
    })().catch(() => {
      if (!cancelled) setState((s) => ({ ...s, loading: false }));
    });

    return () => {
      cancelled = true;
    };
  }, [personalityId]);

  return state;
}
