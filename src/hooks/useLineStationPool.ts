import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Station } from '@/lib/lines/generateLine';

/**
 * The station pool behind the /trips/discover line generator.
 *
 * One RPC, one fetch, cached for an hour. The pool is ~346 rows and changes on
 * the timescale of the ingest crons, not the timescale of a page view, so every
 * reroll and every pick runs against the copy already in memory — a reroll costs
 * zero network.
 *
 * THE SIGNED-IN FLAG IN THE KEY IS NOT COSMETIC. `line_station_pool()` is
 * SECURITY INVOKER and the venue/event RLS gate flows through its aggregate, so
 * an anonymous reader genuinely gets a smaller pool: 337 rows instead of 346,
 * with the nine criminalising-country cities dropping out on their own. Cache
 * those two under one key and signing in would leave the reader on the anon
 * pool (or worse, hand the anon pool's gaps to a signed-in user as if they were
 * the truth).
 */
export function useLineStationPool() {
  const { user } = useAuth();
  const signedIn = Boolean(user);

  return useQuery({
    queryKey: ['line-station-pool', signedIn],
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Station[]> => {
      // `line_station_pool` ships in migration 20260901100000 and is therefore
      // not in the generated `types.ts` yet — that file is regenerated from the
      // live schema after a migration lands. Narrowly cast the NAME only, and
      // hand-type the row, so the mapping below is still checked. Drop the cast
      // when types are regenerated.
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
        ) => Promise<{ data: Record<string, unknown>[] | null; error: Error | null }>
      )('line_station_pool');
      if (error) throw error;
      return (data ?? []).map(
        (r: Record<string, unknown>): Station => ({
          id: String(r.id),
          name: String(r.name ?? ''),
          slug: String(r.slug ?? ''),
          imageUrl: (r.image_url as string | null) ?? null,
          description: (r.description as string | null) ?? null,
          safetyNotes: (r.safety_notes as string | null) ?? null,
          editorialHook: (r.editorial_hook as string | null) ?? null,
          latitude: Number(r.latitude),
          longitude: Number(r.longitude),
          timezone: (r.timezone as string | null) ?? null,
          population: r.population == null ? null : Number(r.population),
          countryId: String(r.country_id),
          countryName: String(r.country_name ?? ''),
          countryCode: (r.country_code as string | null) ?? null,
          currency: (r.currency as string | null) ?? null,
          equalityScore: r.equality_score == null ? null : Number(r.equality_score),
          criminalization: r.lgbti_criminalization ?? null,
          venueCount: Number(r.venue_count ?? 0),
          nightlifeCount: Number(r.nightlife_count ?? 0),
          saunaCount: Number(r.sauna_count ?? 0),
          cafeCount: Number(r.cafe_count ?? 0),
          communityCount: Number(r.community_count ?? 0),
          outdoorCount: Number(r.outdoor_count ?? 0),
          shopCount: Number(r.shop_count ?? 0),
          eventCount: Number(r.event_count ?? 0),
          prideCount: Number(r.pride_count ?? 0),
          nextEventAt: (r.next_event_at as string | null) ?? null,
          nextEventTitle: (r.next_event_title as string | null) ?? null,
          eventMonths: (r.event_months as string[] | null) ?? [],
          villageCount: Number(r.village_count ?? 0),
          villageName: (r.village_name as string | null) ?? null,
        }),
      );
    },
  });
}
