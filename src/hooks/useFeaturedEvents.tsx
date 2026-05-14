import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Event = Database['public']['Tables']['events']['Row'] & {
  venues?: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string | null;
    country: string;
    phone: string | null;
    website: string | null;
    email: string | null;
  } | null;
};

interface UseFeaturedEventsOptions {
  city?: string | null;
  limit?: number;
}

export function useFeaturedEvents({ city, limit = 8 }: UseFeaturedEventsOptions = {}) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let query = supabase
        .from('events')
        .select(
          `
          *,
          venues!venue_id(id, name, address, city, state, country, phone, website, email)
        `,
        )
        .eq('status', 'active')
        .eq('is_featured', true)
        .is('duplicate_of_id', null)
        .gte('start_date', new Date().toISOString())
        .order('start_date', { ascending: true })
        .limit(limit);

      if (city) query = query.ilike('city', city);

      const { data } = await query;
      if (!cancelled) {
        setEvents((data as Event[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [city, limit]);

  return { events, loading };
}
