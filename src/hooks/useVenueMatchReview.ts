import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { untypedSupabase } from '@/integrations/supabase/untyped';

export interface VenueMatchCandidate {
  id: string;
  name: string;
  address: string | null;
  website: string | null;
  name_exact: boolean;
  distance_m: number | null;
}
export interface VenueMatchContext {
  event: {
    id: string;
    venue_name: string | null;
    address: string | null;
    venue_id: string | null;
    city_id: string | null;
    country_id: string | null;
    updated_at: string;
    source_url: string | null;
  };
  city: string | null;
  country: string | null;
  candidates: VenueMatchCandidate[];
}
export function useVenueMatchReview(eventId: string | null, search: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['venue-match-review', user?.id, eventId, search],
    enabled: !!user?.id && !!eventId,
    queryFn: async ({ signal }) => {
      const { data, error } = await untypedSupabase
        .rpc('get_event_venue_review_context', { p_event_id: eventId, p_search: search || null })
        .abortSignal(signal);
      if (error) throw new Error(error.message);
      if (!data) throw new Error('No live venue comparison was returned.');
      return data as VenueMatchContext;
    },
    staleTime: 30_000,
  });
}
