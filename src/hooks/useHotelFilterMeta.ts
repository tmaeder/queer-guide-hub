import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface HotelFilterMeta {
  availableTypes: Set<string>;
  priceAvailable: boolean;
}

const ONE_HOUR = 1000 * 60 * 60;

async function fetchMeta(): Promise<HotelFilterMeta> {
  const [typesRes, priceRes] = await Promise.all([
    supabase.from('hotels').select('hotel_type').not('hotel_type', 'is', null),
    supabase
      .from('hotels')
      .select('id', { head: true, count: 'exact' })
      .not('price_range', 'is', null),
  ]);

  const availableTypes = new Set<string>();
  for (const row of typesRes.data ?? []) {
    const value = row.hotel_type;
    if (typeof value === 'string' && value.trim().length > 0) {
      availableTypes.add(value.toLowerCase());
    }
  }

  return {
    availableTypes,
    priceAvailable: (priceRes.count ?? 0) > 0,
  };
}

export function useHotelFilterMeta() {
  return useQuery({
    queryKey: ['hotels', 'filter-meta'],
    queryFn: fetchMeta,
    staleTime: ONE_HOUR,
    gcTime: ONE_HOUR,
  });
}
