import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';
import type { Station } from '@/lib/lines/generateLine';

type GeneratedPoolRow = Database['public']['Functions']['line_station_pool']['Returns'][number];

/**
 * THE GENERATED TYPE CLAIMS EVERY COLUMN IS NON-NULL. IT IS NOT.
 *
 * A Postgres `RETURNS TABLE` signature carries no nullability information, so
 * the type generator marks every output column non-null. For this function that
 * is wrong for eight columns, and wrong on the MAJORITY of rows. Measured over
 * the live 346-row pool:
 *
 *   editorial_hook        285 null (82%)
 *   lgbt_friendly_rating  291 null (84%)
 *   village_name          263 null (76%)
 *   next_event_at         216 null (62%)
 *   next_event_title      216 null
 *   event_months          216 null
 *   timezone               99 null (29%)
 *   population              7 null
 *
 * Taking the generated shape at face value would let a future edit write
 * `row.editorial_hook.trim()` and crash on four rows in five. So the generated
 * type is used for the column NAMES — a rename or a dropped column still breaks
 * the build — and the nullability is corrected here from measurement.
 *
 * `currency` and `lgbti_criminalization` are genuinely non-null in the data
 * (0 of 346), but both are left nullable below anyway: the SQL joins `countries`
 * and neither column is `NOT NULL` there, so today's zero is a property of the
 * current rows, not a guarantee.
 */
type PoolRow = Omit<
  GeneratedPoolRow,
  | 'editorial_hook'
  | 'lgbt_friendly_rating'
  | 'village_name'
  | 'next_event_at'
  | 'next_event_title'
  | 'event_months'
  | 'timezone'
  | 'population'
  | 'currency'
  | 'country_code'
> & {
  editorial_hook: string | null;
  lgbt_friendly_rating: number | null;
  village_name: string | null;
  next_event_at: string | null;
  next_event_title: string | null;
  event_months: string[] | null;
  timezone: string | null;
  population: number | null;
  currency: string | null;
  country_code: string | null;
};

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
      const { data, error } = await supabase.rpc('line_station_pool');
      if (error) throw error;
      return ((data ?? []) as PoolRow[]).map(
        (r): Station => ({
          id: String(r.id),
          name: String(r.name ?? ''),
          slug: String(r.slug ?? ''),
          imageUrl: r.image_url ?? null,
          description: r.description ?? null,
          safetyNotes: r.safety_notes ?? null,
          editorialHook: r.editorial_hook ?? null,
          latitude: Number(r.latitude),
          longitude: Number(r.longitude),
          timezone: r.timezone ?? null,
          population: r.population == null ? null : Number(r.population),
          countryId: String(r.country_id),
          countryName: String(r.country_name ?? ''),
          countryCode: r.country_code ?? null,
          currency: r.currency ?? null,
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
          nextEventAt: r.next_event_at ?? null,
          nextEventTitle: r.next_event_title ?? null,
          eventMonths: r.event_months ?? [],
          villageCount: Number(r.village_count ?? 0),
          villageName: r.village_name ?? null,
        }),
      );
    },
  });
}
