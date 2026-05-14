import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Event = Database['public']['Tables']['events']['Row'];

export interface Spotlight {
  event: Event;
  /** Number of events happening in the same city within a 30-day window */
  clusterCount: number;
}

/**
 * Picks one event to spotlight at the top of /events.
 * Priority: next upcoming featured event → next pride/festival → null.
 * Also counts nearby events in the same city for a "47 events in Madrid" hint.
 */
export function useEventSpotlight() {
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nowIso = new Date().toISOString();

      const { data: featured } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'active')
        .eq('is_featured', true)
        .is('duplicate_of_id', null)
        .gte('start_date', nowIso)
        .order('start_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      let event = featured as Event | null;
      if (!event) {
        const { data: bigEvent } = await supabase
          .from('events')
          .select('*')
          .eq('status', 'active')
          .is('duplicate_of_id', null)
          .in('event_type', ['pride', 'festival'])
          .gte('start_date', nowIso)
          .order('start_date', { ascending: true })
          .limit(1)
          .maybeSingle();
        event = bigEvent as Event | null;
      }

      if (!event || cancelled) {
        if (!cancelled) {
          setSpotlight(null);
          setLoading(false);
        }
        return;
      }

      let clusterCount = 0;
      if (event.city) {
        const start = new Date(event.start_date);
        const windowStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const windowEnd = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from('events')
          .select('id', { head: true, count: 'exact' })
          .eq('status', 'active')
          .is('duplicate_of_id', null)
          .ilike('city', event.city)
          .gte('start_date', windowStart)
          .lte('start_date', windowEnd);
        clusterCount = count ?? 0;
      }

      if (!cancelled) {
        setSpotlight({ event, clusterCount });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { spotlight, loading };
}
