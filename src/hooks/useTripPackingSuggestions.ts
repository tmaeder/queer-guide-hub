import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTrip } from '@/hooks/useTrips';
import {
  generatePackingSuggestions,
  type PackingQuery,
} from '@/utils/packingSuggestions';

export interface PackingProductSuggestion {
  id: string;
  listingId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  externalUrl: string | null;
  provider: string;
  category: PackingQuery['category'];
  reason: string;
  rank: number;
}

/**
 * For each rule-based packing query, fetch the single best-matching
 * marketplace listing. Runs all queries in parallel.
 */
export function useTripPackingSuggestions(tripId: string | undefined) {
  const { data: trip } = useTrip(tripId);

  return useQuery({
    queryKey: [
      'trip-packing-suggestions',
      tripId,
      trip?.primary_country_code,
      trip?.start_date,
      trip?.end_date,
    ],
    enabled: !!tripId,
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<PackingProductSuggestion[]> => {
      if (!trip) return [];

      // Activities from trip_places categories (safe when no places yet)
      let activities: ReturnType<typeof deriveActivities> = [];
      try {
        const { data: places } = await supabase
          .from('trip_places')
          .select('category')
          .eq('trip_id', trip.id);
        const activityWords = new Set(
          (places ?? [])
            .map((p: { category: string | null }) => (p?.category || '').toLowerCase())
            .filter(Boolean),
        );
        activities = deriveActivities(activityWords);
      } catch {
        activities = [];
      }

      // Country climate + equality score (skip if no country set)
      let equalityScore: number | null = null;
      if (trip.primary_country_id) {
        try {
          const { data: country } = await supabase
            .from('countries')
            .select('equality_score')
            .eq('id', trip.primary_country_id)
            .maybeSingle();
          equalityScore =
            (country as { equality_score: number | null } | null)?.equality_score ?? null;
        } catch {
          equalityScore = null;
        }
      }

      const queries = generatePackingSuggestions({
        countryCode: trip.primary_country_code ?? null,
        startDate: trip.start_date ?? null,
        endDate: trip.end_date ?? null,
        activities,
        equalityScore,
      });

      // Fan-out Meilisearch-via-Supabase queries; each returns top 1 match.
      // Each query is isolated so a single failure can't crash the panel.
      const results = await Promise.all(
        queries.map(async (q, idx): Promise<PackingProductSuggestion | null> => {
          try {
            const terms = (q.query || '')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 3)
              .join(' OR ');
            if (!terms) return null;
            const { data, error } = await supabase
              .from('marketplace_listings')
              .select('id, title, description, price, currency, images, external_url, business_name')
              .eq('status', 'active')
              .textSearch('title', terms, {
                type: 'websearch',
                config: 'english',
              })
              .order('featured', { ascending: false })
              .limit(1);
            if (error || !data || data.length === 0) return null;
            const row = data[0] as Record<string, unknown>;
            return {
              id: `pack:${q.category}:${idx}`,
              listingId: row.id as string,
              title: (row.title as string) ?? q.query,
              description: (row.description as string | null) ?? null,
              imageUrl: (row.images as string[] | null)?.[0] ?? null,
              price: (row.price as number | null) ?? null,
              currency: (row.currency as string | null) ?? null,
              externalUrl: (row.external_url as string | null) ?? null,
              provider: (row.business_name as string | null) ?? 'Marketplace',
              category: q.category,
              reason: q.reason,
              rank: idx,
            };
          } catch {
            return null;
          }
        }),
      );

      return results.filter((r): r is PackingProductSuggestion => r != null);
    },
  });
}

function deriveActivities(words: Set<string>): Array<
  'beach' | 'hiking' | 'nightlife' | 'business' | 'cultural' | 'food' | 'adventure'
> {
  const out: Array<
    'beach' | 'hiking' | 'nightlife' | 'business' | 'cultural' | 'food' | 'adventure'
  > = [];
  const hit = (needle: string) => Array.from(words).some((w) => w.includes(needle));
  if (hit('beach') || hit('sea')) out.push('beach');
  if (hit('hike') || hit('trail') || hit('mountain')) out.push('hiking');
  if (hit('bar') || hit('club') || hit('night')) out.push('nightlife');
  if (hit('work') || hit('business') || hit('meeting')) out.push('business');
  if (hit('museum') || hit('gallery') || hit('heritage')) out.push('cultural');
  if (hit('restaurant') || hit('food')) out.push('food');
  if (hit('adventure') || hit('extreme')) out.push('adventure');
  return out;
}
