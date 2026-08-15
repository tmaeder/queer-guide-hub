import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { searchFetch } from '@/lib/searchFetch';
import { getSessionId } from '@/lib/searchClient';
import { detailHref } from '@/lib/searchRoutes';
import { supabase } from '@/integrations/supabase/client';
import type { HomeRegion } from '@/hooks/useHomeRegion';

export interface YourLinesCard {
  type: string;
  slug: string;
  href: string;
  title: string;
  subtitle: string;
  reason: string;
  image?: string | null;
}

interface WorkerHit {
  objectID?: string;
  id?: string;
  type?: string;
  slug?: string | null;
  title?: string | null;
  name?: string | null;
  city?: string | null;
  country?: string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  optimized_url?: string | null;
  _boostReason?: 'interest' | 'recent_tag' | 'home_city' | 'recent_city' | 'featured' | null;
}

/**
 * Region-aware discovery for the "Your lines" band.
 *
 * Goes through the search worker's `/search` browse path (empty query + a
 * location filter), which is the one DEPLOYED path that returns `_boostReason`
 * and applies the worker's ranking — including its seen-recently penalty, so
 * repeated visits drift on their own without a rotation seed.
 *
 * Deliberately NOT the recommendations paths. `user_recommendations` has no
 * writer (its edge function has no cron and no caller), and `/recommendations`
 * sits behind `VITE_RECOMMENDATIONS_ENABLED`, which is set in no env file and
 * no CI workflow. Both would return nothing in production today.
 *
 * Calls `searchFetch` inside a `useQuery` rather than mounting `useSearch`:
 * that hook is useState/useEffect with no cache and no cross-mount dedupe.
 */
export function useYourLinesDiscovery(region: HomeRegion, limit = 8) {
  const { t } = useTranslation();

  return useQuery({
    queryKey: ['your-lines-discovery', region.cityName, region.countryCode, limit],
    // Without a region there is no honest framing for these cards, and the
    // band already self-hides when it has nothing.
    enabled: !region.loading && !!region.cityName,
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<YourLinesCard[]> => {
      const { data: session } = await supabase.auth.getSession();
      const res = await searchFetch<{ hits?: WorkerHit[]; results?: WorkerHit[] }>('/search', {
        query: '',
        filters: { location: region.cityName, types: ['venue', 'event'] },
        hitsPerPage: limit,
        page: 0,
        user_id: session.session?.user?.id ?? null,
        session_id: getSessionId(),
      });

      const hits = res.hits ?? res.results ?? [];
      const reasonFor = (h: WorkerHit) => {
        switch (h._boostReason) {
          case 'interest':
          case 'recent_tag':
            return t('home.yourLines.reasonInterest', 'Matches your interests');
          case 'home_city':
          case 'recent_city':
            return t('home.yourLines.reasonCity', 'Near you');
          case 'featured':
            return t('home.yourLines.reasonFeatured', 'Worth a look');
          default:
            // No boost fired — say where it is, not why we "picked" it.
            return region.cityName
              ? t('home.yourLines.reasonIn', 'In {{city}}', { city: region.cityName })
              : t('home.yourLines.reasonFeatured', 'Worth a look');
        }
      };

      return hits
        .map((h): YourLinesCard | null => {
          const title = h.title || h.name || '';
          const href = detailHref({
            type: h.type ?? '',
            slug: h.slug ?? null,
            id: h.objectID ?? h.id ?? '',
            title,
          });
          // detailHref returns null for slug-less / UUID-only hits, so a dead
          // /type/<uuid> link can never be rendered.
          if (!href || !title || !h.slug) return null;
          return {
            type: h.type ?? 'venue',
            slug: h.slug,
            href,
            title,
            subtitle: [h.city, h.country].filter(Boolean).join(', '),
            reason: reasonFor(h),
            image: h.optimized_url || h.thumbnail_url || h.image_url || null,
          };
        })
        .filter((c): c is YourLinesCard => c !== null);
    },
    // A search outage must never take the homepage band down with it.
    retry: false,
  });
}
