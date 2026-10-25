import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import type { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];

export interface VenueRailParams {
  userId: string | null;
  lat: number | null;
  lng: number | null;
  filters?: Record<string, unknown>;
  sort: string;
  limit?: number;
}

export interface VenueRailData {
  loading: boolean;
  venues: Venue[];
}

async function fetchRanked(params: VenueRailParams): Promise<Venue[]> {
  const { data, error } = await untypedRpc<Array<{ venue: Venue }>>('rpc_venues_ranked', {
    p_user_id: params.userId,
    p_lat: params.lat,
    p_lng: params.lng,
    p_filters: params.filters ?? {},
    p_sort: params.sort,
    p_limit: params.limit ?? 8,
    p_offset: 0,
  });
  if (error || !data) return [];
  return data.map((r) => r.venue);
}

/** One /venues discovery rail, keyed on its full RPC params. */
export function useVenueRail(enabled: boolean, params: VenueRailParams): VenueRailData {
  const query = useQuery({
    queryKey: ['venues', 'rail', params],
    queryFn: () => fetchRanked(params),
    enabled,
    staleTime: 5 * 60_000,
  });
  return { loading: enabled && query.isPending, venues: query.data ?? [] };
}
