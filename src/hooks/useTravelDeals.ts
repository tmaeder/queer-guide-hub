import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TravelDeal {
  origin: string;
  destination: string;
  price: number;
  currency: string;
  departure_date: string | null;
  return_date: string | null;
  airline: string | null;
  flight_number?: string;
  stops: number;
  duration?: number;
  affiliate_url: string;
}

interface UseTravelDealsOptions {
  origin?: string | null;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  type?: 'flights' | 'popular_routes';
  currency?: string;
  limit?: number;
  enabled?: boolean;
}

export function useTravelDeals({
  origin,
  destination,
  departureDate,
  returnDate,
  type = 'flights',
  currency = 'eur',
  limit = 6,
  enabled = true,
}: UseTravelDealsOptions) {
  return useQuery({
    queryKey: [
      'travel-deals',
      origin,
      destination,
      type,
      currency,
      limit,
      departureDate,
      returnDate,
    ],
    queryFn: async (): Promise<TravelDeal[]> => {
      if (!origin) return [];

      const body: Record<string, unknown> = { origin, type, currency, limit };
      if (destination) body.destination = destination;
      if (departureDate) body.departureDate = departureDate;
      if (returnDate) body.returnDate = returnDate;

      const { data, error } = await supabase.functions.invoke('travel-deals', { body });

      if (error) throw error;
      if (!Array.isArray(data?.deals) || data?.success === false) {
        throw new Error('Fare search is unavailable. Please try again.');
      }
      return data.deals;
    },
    enabled: enabled && !!origin,
    retry: false,
    staleTime: 15 * 60 * 1000, // 15 min
    gcTime: 30 * 60 * 1000, // 30 min
  });
}
