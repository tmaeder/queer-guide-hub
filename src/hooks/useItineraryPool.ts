import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Candidate, DayPart } from '@/lib/itinerary/generateItinerary';

/**
 * The candidate pool behind the day-level itinerary generator.
 *
 * One RPC, one fetch, cached — the `useLineStationPool` pattern, and for the
 * same reasons. The pool changes on the timescale of the ingest crons, not the
 * timescale of a picker click, so every reroll runs against the copy already in
 * memory and costs zero network.
 *
 * THE SIGNED-IN FLAG IN THE KEY IS NOT COSMETIC. `itinerary_candidate_pool` is
 * SECURITY INVOKER, so `venues`/`events` RLS — `((NOT safety_gated) OR
 * (auth.uid() IS NOT NULL))` — filters the pool as the CALLER. An anonymous
 * reader gets a smaller pool in criminalising countries, by design, which means
 * the same seed yields a different plan signed-out vs signed-in. Caching the
 * two under one key would serve a signed-out visitor rows the safety layer has
 * deliberately decided not to show them.
 */

/**
 * The RPC's row shape.
 *
 * Written by hand rather than read from `Database['public']['Functions']`
 * because the migration adding it ships in this change and `types.ts` is
 * regenerated from the applied schema. Once it lands, the generated names can
 * replace the string literals here — but NOT the nullability: a Postgres
 * `RETURNS TABLE` signature carries none, so the generator marks every column
 * non-null, which for this pool is wrong on the majority of rows for
 * `price_level` (97.8% null), `rating`, `subtype`, `image_url` and every event
 * column on a venue row. Same correction, same reason, as `useLineStationPool`.
 */
interface PoolRow {
  kind: 'venue' | 'event';
  id: string;
  name: string;
  slug: string | null;
  city_id: string;
  country_id: string | null;
  latitude: number;
  longitude: number;
  category: string | null;
  subtype: string | null;
  day_part: string[] | null;
  day_part_known: boolean;
  tags: string[] | null;
  accessibility_attributes: string[] | null;
  amenities: string[] | null;
  price_level: number | null;
  is_free: boolean | null;
  quality_score: number | null;
  rating: number | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue_id: string | null;
}

const DAY_PART_VALUES = new Set<string>(['morning', 'afternoon', 'evening', 'night']);

function toDayParts(raw: string[] | null): DayPart[] {
  return (raw ?? []).filter((p): p is DayPart => DAY_PART_VALUES.has(p));
}

function toCandidate(row: PoolRow): Candidate {
  return {
    kind: row.kind,
    id: row.id,
    name: row.name,
    slug: row.slug,
    cityId: row.city_id,
    countryId: row.country_id,
    latitude: row.latitude,
    longitude: row.longitude,
    category: row.category,
    subtype: row.subtype,
    dayPart: toDayParts(row.day_part),
    dayPartKnown: row.day_part_known,
    tags: row.tags ?? [],
    accessibilityAttributes: row.accessibility_attributes ?? [],
    amenities: row.amenities ?? [],
    priceLevel: row.price_level,
    isFree: row.is_free,
    qualityScore: row.quality_score,
    rating: row.rating,
    imageUrl: row.image_url,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    venueId: row.venue_id,
  };
}

export function useItineraryPool(cityIds: string[], from: string | null, to: string | null) {
  const { user } = useAuth();
  const ids = [...new Set(cityIds.filter(Boolean))].sort();

  return useQuery({
    queryKey: ['itinerary-pool', ids, from, to, !!user],
    enabled: ids.length > 0,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Candidate[]> => {
      // `null` and an omitted argument are the same thing to this RPC — its SQL
      // defaults are literally `NULL::date` — and omitting is what the generated
      // optional-argument type expects, so normalise rather than widen the type.
      const { data, error } = await supabase.rpc('itinerary_candidate_pool', {
        p_city_ids: ids,
        p_from: from ?? undefined,
        p_to: to ?? undefined,
      });
      if (error) throw error;
      // `PoolRow` deliberately overrides the generated row type, which is LOOSER
      // in two ways that matter here: the generator types a `TABLE(...)` return
      // with every column non-null (most of these are nullable), and it can only
      // see `kind` as `string` where the RPC emits exactly 'venue' | 'event'.
      // Narrowing here is what lets `toCandidate` switch on `kind` exhaustively.
      return ((data ?? []) as unknown as PoolRow[]).map(toCandidate);
    },
  });
}
