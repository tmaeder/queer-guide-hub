import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Hotel } from '@/hooks/useHotels';

export interface TopHotelCity {
  city_id: string;
  name: string;
  slug: string | null;
  country: string | null;
  image_url: string | null;
  hotel_count: number;
}

const DISCOVERY_COLS =
  'id, name, slug, city, country, hotel_type, price_range, star_rating, images, tags, lgbtq_friendly, featured, featured_priority, queer_village_id, queer_safety_notes, latitude, longitude, created_at';

export function useFeaturedHotel() {
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('hotels')
        .select(DISCOVERY_COLS)
        .not('featured_priority', 'is', null)
        .order('featured_priority', { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setHotel((data as Hotel | null) ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { hotel, loading };
}

export function useEditorialHotels(excludeId?: string) {
  const [inVillages, setInVillages] = useState<Hotel[]>([]);
  const [picks, setPicks] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [villagesRes, picksRes] = await Promise.all([
        supabase
          .from('hotels')
          .select(DISCOVERY_COLS)
          .not('queer_village_id', 'is', null)
          .order('featured_priority', { ascending: true, nullsFirst: false })
          .order('star_rating', { ascending: false, nullsFirst: false })
          .limit(12),
        supabase
          .from('hotels')
          .select(DISCOVERY_COLS)
          .not('featured_priority', 'is', null)
          .order('featured_priority', { ascending: true })
          .limit(13),
      ]);
      if (cancelled) return;
      const v = (villagesRes.data as Hotel[] | null) ?? [];
      const p = ((picksRes.data as Hotel[] | null) ?? []).filter(
        (h) => h.id !== excludeId,
      );
      setInVillages(v.filter((h) => h.id !== excludeId).slice(0, 10));
      setPicks(p.slice(0, 12));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [excludeId]);

  return { inVillages, picks, loading };
}

export function useTopHotelCities(limit = 8) {
  const [cities, setCities] = useState<TopHotelCity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (
        supabase as unknown as {
          rpc: (
            fn: string,
            args: { result_limit: number },
          ) => Promise<{ data: TopHotelCity[] | null; error: { code?: string } | null }>;
        }
      ).rpc('hotels_top_cities', { result_limit: limit });
      if (cancelled) return;
      if (error || !data) {
        setCities([]);
      } else {
        setCities(data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { cities, loading };
}
