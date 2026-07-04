import { useEffect, useState } from 'react';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import type { Tables } from '@/integrations/supabase/types';

export type ReadArticle = Pick<
  Tables<'news_articles'>,
  'id' | 'slug' | 'title' | 'excerpt' | 'image_url' | 'published_at' | 'country_ids' | 'category' | 'publisher_name'
> & { read_at: string };

interface Options {
  limit?: number;
}

// Lists the signed-in user's recently-read news articles (joined from
// user_news_reads). Also surfaces aggregate stats: distinct country count
// (lifetime coverage) and total reads.
export function useUserNewsReadsList({ limit = 30 }: Options = {}) {
  const { user } = useAuth();
  const [reads, setReads] = useState<ReadArticle[]>([]);
  const [totalReads, setTotalReads] = useState(0);
  const [countriesCovered, setCountriesCovered] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setReads([]);
      setTotalReads(0);
      setCountriesCovered(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Recent reads — list view.
      const recent = await untypedFrom('user_news_reads')
        .select(
          'read_at, news_articles!inner(id, slug, title, excerpt, image_url, published_at, country_ids, category, publisher_name)' as never,
        )
        .eq('user_id' as never, user.id as never)
        .order('read_at' as never, { ascending: false } as never)
        .limit(limit);

      // Total count.
      const total = await untypedFrom('user_news_reads')
        .select('*', { count: 'exact', head: true } as never)
        .eq('user_id' as never, user.id as never);

      // Lifetime country coverage — pull distinct country_ids across all reads.
      const cov = await untypedFrom('user_news_reads')
        .select('news_articles!inner(country_ids)' as never)
        .eq('user_id' as never, user.id as never);

      if (cancelled) return;

      const rows = (recent.data ?? []) as unknown as Array<{
        read_at: string;
        news_articles: Omit<ReadArticle, 'read_at'>;
      }>;
      setReads(
        rows.map((r) => ({
          ...r.news_articles,
          read_at: r.read_at,
        })),
      );

      setTotalReads(total.count ?? 0);

      const countries = new Set<string>();
      const covRows = (cov.data ?? []) as unknown as Array<{
        news_articles: { country_ids?: string[] | null };
      }>;
      covRows.forEach((r) => {
        (r.news_articles?.country_ids ?? []).forEach((c) => countries.add(c));
      });
      setCountriesCovered(countries.size);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only user identity (via user?.id) and limit drive the refetch; pulling the whole `user` object would re-run on every TOKEN_REFRESHED.
  }, [user?.id, limit]);

  return { reads, totalReads, countriesCovered, loading };
}
