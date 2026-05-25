import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Options {
  /** When true, ignore inserts older than the page-load timestamp. Default true. */
  sincePageLoad?: boolean;
  /** Cap the surfaced count so the pill never looks dramatic. Default 25. */
  cap?: number;
}

// Subscribes to news_articles INSERT events. Returns the number of brand-new
// rows that have arrived since the hook mounted (capped). Filters out
// quality-failed rows and dedup-marked rows so the pill only counts what
// would actually appear on /news.
//
// The hook deliberately does NOT auto-refresh the feed — it just counts. The
// consumer renders a pill the user can opt into; auto-jumping would lose
// scroll position.
export function useRealtimeNewsInserts({ sincePageLoad = true, cap = 25 }: Options = {}) {
  const [count, setCount] = useState(0);
  // useRef initializer runs once at mount; capturing Date.now() here is the
  // canonical "mount timestamp" pattern.
  // eslint-disable-next-line react-hooks/purity -- initializer runs once at first render.
  const mountedAt = useRef<number>(Date.now());

  useEffect(() => {
    const channel = supabase
      .channel('news-articles-inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'news_articles' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (!row) return;
          // Match the same visibility filters useNews applies.
          if (row.duplicate_of_id != null) return;
          if (!row.published_at) return;
          if (!row.content) return;
          const qs = row.quality_status as string | null | undefined;
          if (qs && qs !== 'passed') return;
          if (sincePageLoad) {
            const pubMs = new Date(row.published_at as string).getTime();
            if (Number.isFinite(pubMs) && pubMs < mountedAt.current - 60_000) return;
          }
          setCount((c) => Math.min(cap, c + 1));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sincePageLoad, cap]);

  const reset = () => setCount(0);
  return { count, reset };
}
