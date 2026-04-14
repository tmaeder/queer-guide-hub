import type { BookingProvider, BookingSearchParams, BookingResult } from '../types';
import { supabase } from '@/integrations/supabase/client';

export const hotellookProvider: BookingProvider = {
  name: 'hotellook',
  vertical: 'hotel',
  supportsInApp: false,

  async search(params: BookingSearchParams): Promise<BookingResult[]> {
    const { cityName, checkIn, checkOut, guests = 2, currency = 'eur', limit = 12 } = params;
    if (!cityName) return [];

    const { data, error } = await supabase.functions.invoke('hotel-search', {
      body: {
        city: cityName,
        checkIn,
        checkOut,
        guests,
        currency,
        limit,
      },
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
      currency: (hotel.currency as string) || currency,
      rating: hotel.rating as number | undefined,
      reviewCount: hotel.reviews as number | undefined,
      starRating: hotel.stars as number | undefined,
      lgbtqFriendly: hotel.lgbtqFriendly as boolean | undefined,
      bookingUrl: hotel.bookingUrl as string | undefined,
      supportsInApp: false,
      providerData: hotel,
    }));
  },

  getBookingUrl(result: BookingResult): string {
    return result.bookingUrl || 'https://www.hotellook.com';
  },
};
