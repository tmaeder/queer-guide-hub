/**
 * useEventSeries — "Eventreihen" carry-over. Given a typed event title (+ optional city),
 * debounced-fetches the most recent PAST editions of the same series via the
 * event_previous_editions RPC, so a contributor can clone last time's details into a new
 * edition instead of retyping.
 */

import { useEffect, useState } from 'react';
import { untypedRpc } from '@/integrations/supabase/untyped';

export interface PreviousEdition {
  id: string;
  title: string;
  edition: string | null;
  start_date: string | null;
  festival_id: string | null;
  description: string | null;
  event_type: string | null;
  venue_id: string | null;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  city_id: string | null;
  country: string | null;
  country_id: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  ticket_url: string | null;
  is_free: boolean | null;
  price_min: number | null;
  price_max: number | null;
}

/** Fields copied from a prior edition. Excludes occurrence-specific fields the user must
 *  set fresh (dates, edition label) — but carries festival_id so the series stays grouped. */
export function cloneFieldsFromEdition(e: PreviousEdition): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const carry: (keyof PreviousEdition)[] = [
    'festival_id',
    'description',
    'event_type',
    'venue_id',
    'venue_name',
    'address',
    'city',
    'city_id',
    'country',
    'country_id',
    'latitude',
    'longitude',
    'website',
    'ticket_url',
    'is_free',
    'price_min',
    'price_max',
  ];
  for (const key of carry) {
    const v = e[key];
    if (v !== null && v !== undefined && v !== '') out[key] = v;
  }
  return out;
}

export function useEventSeries(enabled: boolean, title: string, city: string) {
  const [editions, setEditions] = useState<PreviousEdition[]>([]);
  const trimmed = title.trim();

  useEffect(() => {
    const valid = enabled && trimmed.length >= 3;
    let cancelled = false;

    const timer = setTimeout(
      async () => {
        if (!valid) {
          if (!cancelled) setEditions([]);
          return;
        }
        // p_city is passed as `string | null`, but the generated p_city?: string arg
        // rejects null — route through untypedRpc to preserve the null passthrough.
        const { data, error } = await untypedRpc('event_previous_editions', {
          p_title: trimmed,
          p_city: city.trim() || null,
          p_limit: 3,
        });
        if (cancelled) return;
        setEditions(!error && Array.isArray(data) ? (data as PreviousEdition[]) : []);
      },
      valid ? 600 : 0,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, trimmed, city]);

  return { editions };
}
