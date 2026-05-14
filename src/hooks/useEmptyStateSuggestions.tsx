import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Event = Database['public']['Tables']['events']['Row'];

export interface EmptyStateSuggestions {
  /** Alternative events in the same city, ignoring date filter */
  sameCityDifferentDate: Event[];
  /** Top upcoming events in other cities, matching the date filter */
  otherCitiesSameDate: Event[];
  /** Generic next upcoming events (last resort) */
  fallback: Event[];
}

interface UseEmptyStateSuggestionsOptions {
  enabled: boolean;
  city?: string;
  dateRange?: { start: string; end: string };
}

/**
 * Fetches alternative events to show when the user's filters yield zero results.
 * Three buckets, only one is typically non-empty depending on which filter the
 * caller dropped.
 */
export function useEmptyStateSuggestions({ enabled, city, dateRange }: UseEmptyStateSuggestionsOptions) {
  const [suggestions, setSuggestions] = useState<EmptyStateSuggestions>({
    sameCityDifferentDate: [],
    otherCitiesSameDate: [],
    fallback: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const nowIso = new Date().toISOString();

      const sameCity: Event[] = city
        ? ((await supabase
            .from('events')
            .select('*')
            .eq('status', 'active')
            .is('duplicate_of_id', null)
            .ilike('city', city)
            .gte('start_date', nowIso)
            .order('start_date', { ascending: true })
            .limit(4)).data as Event[]) ?? []
        : [];

      const otherCities: Event[] = dateRange
        ? ((await supabase
            .from('events')
            .select('*')
            .eq('status', 'active')
            .is('duplicate_of_id', null)
            .gte('start_date', dateRange.start)
            .lte('start_date', dateRange.end)
            .order('is_featured', { ascending: false })
            .order('start_date', { ascending: true })
            .limit(4)).data as Event[]) ?? []
        : [];

      let fallback: Event[] = [];
      if (sameCity.length === 0 && otherCities.length === 0) {
        fallback = ((await supabase
          .from('events')
          .select('*')
          .eq('status', 'active')
          .is('duplicate_of_id', null)
          .gte('start_date', nowIso)
          .order('is_featured', { ascending: false })
          .order('start_date', { ascending: true })
          .limit(4)).data as Event[]) ?? [];
      }

      if (!cancelled) {
        setSuggestions({
          sameCityDifferentDate: sameCity,
          otherCitiesSameDate: otherCities,
          fallback,
        });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  // dateRange compared by start/end strings — passing the object identity
  // would re-fire on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, city, dateRange?.start, dateRange?.end]);

  return { suggestions, loading };
}
