import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * News articles geo-tagged to one of the trip's countries, last 30 days,
 * ranked by recency. Used by the trip Safety tab to surface advisories,
 * pride/protest news, and recent local context.
 *
 * Uses `overlaps()` against `news_articles.country_ids[]` (array column).
 * Limited to 12 to keep the panel scannable.
 */
export interface TripNewsArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  url: string;
  image_url: string | null;
  published_at: string;
  publisher_name: string | null;
  category: string;
  country_ids: string[] | null;
  /** True when normalized title or excerpt mentions safety-relevant terms. */
  isSafetyFlagged: boolean;
}

const SAFETY_TERMS = [
  'attack',
  'violence',
  'hate crime',
  'protest',
  'arrest',
  'detain',
  'raid',
  'crackdown',
  'banned',
  'curfew',
  'death',
  'killed',
  'shoot',
  'assault',
  'lgbtq',
  'lgbti',
  'queer',
  'gay',
  'lesbian',
  'trans',
];

function isSafetyFlagged(title: string, excerpt: string | null): boolean {
  const haystack = `${title} ${excerpt ?? ''}`.toLowerCase();
  // Safety keyword AND queer keyword present → likely directly relevant
  const hasSafety = SAFETY_TERMS.slice(0, 14).some((t) => haystack.includes(t));
  const hasQueer = SAFETY_TERMS.slice(14).some((t) => haystack.includes(t));
  return hasSafety && hasQueer;
}

export function useTripNews(countryIds: string[]) {
  return useQuery({
    queryKey: ['trip-news', [...countryIds].sort()],
    queryFn: async (): Promise<TripNewsArticle[]> => {
      if (countryIds.length === 0) return [];
      const sinceIso = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data, error } = await supabase
        .from('news_articles')
        .select(
          'id, slug, title, excerpt, url, image_url, published_at, publisher_name, category, country_ids',
        )
        .overlaps('country_ids', countryIds)
        .gte('published_at', sinceIso)
        .is('duplicate_of_id', null)
        .order('published_at', { ascending: false })
        .limit(12);

      if (error) throw error;

      return (data ?? []).map((row) => ({
        ...row,
        isSafetyFlagged: isSafetyFlagged(row.title, row.excerpt),
      })) as TripNewsArticle[];
    },
    enabled: countryIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

export const __testing = { isSafetyFlagged };
