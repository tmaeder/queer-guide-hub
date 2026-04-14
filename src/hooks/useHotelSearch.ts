import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BookingResult } from '@/lib/booking/types';

interface UseHotelSearchOptions {
  city?: string | null;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  currency?: string;
  limit?: number;
  enabled?: boolean;
}

export function useHotelSearch({
  city,
  checkIn,
  checkOut,
  guests = 2,
  currency = 'eur',
  limit = 12,
  enabled = true,
}: UseHotelSearchOptions) {
  return useQuery({
    queryKey: ['hotel-search', city, checkIn, checkOut, guests, currency, limit],
    queryFn: async (): Promise<BookingResult[]> => {
      if (!city) return [];

      const { data, error } = await supabase.functions.invoke('hotel-search', {
        body: { city, checkIn, checkOut, guests, currency, limit },
      });

      if (error || !data?.hotels) return [];

      return (data.hotels as Record<string, unknown>[]).map((hotel, i) => ({
        id: `hl-${hotel.hotelId || i}`,
        provider: 'hotellook',
        vertical: 'hotel' as const,
        title: hotel.hotelName as string,
        subtitle: hotel.location as string | undefined,
        imageUrl: hotel.photoUrl as string | undefined,
        price: hotel.priceFrom as number,
        originalPrice: hotel.priceOld as number | undefined,
        currency: (hotel.currency as string) || currency.toUpperCase(),
        rating: hotel.rating as number | undefined,
        reviewCount: hotel.reviews as number | undefined,
        starRating: hotel.stars as number | undefined,
        lgbtqFriendly: hotel.lgbtqFriendly as boolean | undefined,
        bookingUrl: hotel.bookingUrl as string | undefined,
        supportsInApp: false,
      }));
    },
    enabled: enabled && !!city,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
