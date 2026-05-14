import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];

/**
 * Fetches the N most recently added venues (created_at DESC). Used for the
 * "Recently added" rail on `/venues` when no filters are applied.
 *
 * `enabled` lets the caller skip the query (e.g. when filters are active and
 * the rail wouldn't render anyway).
 */
export function useRecentVenues(limit = 8, enabled = true) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('venues')
        .select('*')
        .neq('data_source', 'refuge_restrooms')
        .is('duplicate_of_id', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (!cancelled) {
        if (data) setVenues(data as unknown as Venue[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit, enabled]);

  return { venues, loading };
}
