import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { supabase } from '@/integrations/supabase/client';

/**
 * The old /travel/book page's query keys. Its links still exist in emails,
 * bookmarks and CityTravelHub / TripBookingAssistant, and /travel/book itself
 * now 301s to /travel with the query kept.
 */
const LEGACY_KEYS = [
  'intent',
  'tab',
  'city',
  'hotelCity',
  'activityCity',
  'to',
  'checkIn',
  'checkOut',
  'type',
  'priceMin',
  'priceMax',
  'lgbtqOnly',
] as const;

const TAB_STEP: Record<string, string> = {
  hotels: 'stay',
  activities: 'to-do',
  flights: 'getting-there',
};
const STAY_TYPES = ['bnb', 'apartment', 'hostel'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Old booking query → the trip finder's second door. Null when nothing to translate. */
export function translateLegacyTravelParams(input: URLSearchParams) {
  if (!LEGACY_KEYS.some((key) => input.has(key))) return null;
  const next = new URLSearchParams(input);
  for (const key of LEGACY_KEYS) next.delete(key);
  next.set('door', 'know');

  const tab = input.get('tab') ?? '';
  if (tab === 'flights') next.set('by', 'flight');
  const checkIn = input.get('checkIn') ?? '';
  const checkOut = input.get('checkOut') ?? '';
  if (ISO_DAY.test(checkIn)) {
    next.set('when', 'custom');
    next.set('start', checkIn);
    if (ISO_DAY.test(checkOut)) next.set('end', checkOut);
  }
  const type = input.get('type') ?? '';
  if (STAY_TYPES.includes(type)) next.set('stay', type);
  if (input.get('lgbtqOnly') === '1') next.set('qf', '1');

  return {
    next,
    step: TAB_STEP[tab] ?? null,
    cityName: input.get('hotelCity') || input.get('activityCity') || input.get('city') || null,
    airport: input.get('to')?.trim().toUpperCase() || null,
  };
}

async function resolveCityId(name: string | null, airport: string | null) {
  if (name) {
    const { data, error } = await supabase.rpc('search_cities', { q: name, max_results: 5 });
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; name: string }>;
    const exact = rows.find((row) => row.name.toLowerCase() === name.toLowerCase());
    return (exact ?? rows[0])?.id ?? null;
  }
  if (airport) {
    const { data, error } = await supabase
      .from('cities')
      .select('id')
      .eq('major_airport_code', airport)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as { id: string } | null)?.id ?? null;
  }
  return null;
}

/**
 * Rewrites an old /travel/book URL into the trip finder's own keys, once, with
 * history replace. Returns true while that is in flight so the page can hold
 * the wizard back instead of flashing the wrong door.
 */
export function useLegacyTravelParams() {
  const [params, setParams] = useSearchParams();
  const legacy = useMemo(() => translateLegacyTravelParams(params), [params]);

  useEffect(() => {
    if (!legacy) return;
    let cancelled = false;
    resolveCityId(legacy.cityName, legacy.airport)
      .catch(() => null)
      .then((cityId) => {
        if (cancelled) return;
        const next = new URLSearchParams(legacy.next);
        // A later step needs a place; without one, start at Where & when.
        if (cityId) {
          next.set('dest', cityId);
          if (legacy.step) next.set('step', legacy.step);
        }
        setParams(next, { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [legacy, setParams]);

  return legacy !== null;
}
