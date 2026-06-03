/**
 * useFestivalSearch — debounced festival lookup for the event submission form's
 * "part of a festival/series?" picker.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface FestivalHit {
  id: string;
  name: string;
  festival_type: string | null;
}

export function useFestivalSearch(query: string, enabled: boolean) {
  const [hits, setHits] = useState<FestivalHit[]>([]);
  const q = query.trim();

  useEffect(() => {
    const valid = enabled && q.length >= 2;
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        if (!valid) {
          if (!cancelled) setHits([]);
          return;
        }
        const { data } = await supabase
          .from('festivals')
          .select('id, name, festival_type')
          .ilike('name', `%${q}%`)
          .order('start_date', { ascending: false, nullsFirst: false })
          .limit(8);
        if (!cancelled) setHits((data as FestivalHit[]) ?? []);
      },
      valid ? 300 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, enabled]);

  return hits;
}
