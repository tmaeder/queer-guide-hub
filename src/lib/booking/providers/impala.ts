import type { BookingProvider, BookingSearchParams, BookingResult, BookingRoom, BookingFlowData, BookingConfirmation } from '../types';
import { supabase } from '@/integrations/supabase/client';

/**
 * Impala Hotel Booking Provider
 *
 * In-app hotel booking via Impala API.
 * Handles: search, room selection, booking creation, cancellation.
 *
 * Requires IMPALA_API_KEY env var on the edge function.
 * When not configured, falls back to Hotellook affiliate.
 *
 * To activate: set `supports_in_app = true` on the affiliate_partners row
 * for 'impala' once API access is approved.
 */
export const impalaProvider: BookingProvider = {
  name: 'impala',
  vertical: 'hotel',
  supportsInApp: true,

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
        provider: 'impala',
      },
    });

    if (error || !data?.hotels) return [];

    return (data.hotels as Record<string, unknown>[]).map((hotel, i) => ({
      id: `impala-${hotel.hotelId || i}`,
      provider: 'impala',
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
      bookingUrl: undefined, // In-app booking, no redirect
      supportsInApp: true,
      providerData: hotel,
    }));
  },

  async getRoomOptions(itemId: string, params: BookingSearchParams): Promise<BookingRoom[]> {
    const { data, error } = await supabase.functions.invoke('hotel-booking', {
      body: {
        action: 'get_rooms',
        provider: 'impala',
        hotelId: itemId,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        guests: params.guests,
      },
    });

    if (error || !data?.rooms) return [];

    return (data.rooms as Record<string, unknown>[]).map((room) => ({
      roomId: room.id as string,
      roomName: room.name as string,
      price: room.price as number,
      currency: (room.currency as string) || 'EUR',
      cancellationPolicy: room.cancellationPolicy as string | undefined,
      breakfastIncluded: room.breakfastIncluded as boolean | undefined,
    }));
  },

  async createBooking(data: BookingFlowData): Promise<BookingConfirmation> {
    const { data: result, error } = await supabase.functions.invoke('hotel-booking', {
      body: {
        action: 'create_booking',
        provider: 'impala',
        hotelId: data.providerItemId,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        guests: data.guests,
        rooms: data.rooms,
      },
    });

    if (error) throw new Error(error.message || 'Booking failed');

    return {
      bookingId: result.bookingId,
      providerBookingId: result.providerBookingId,
      provider: 'impala',
      status: result.status || 'confirmed',
      confirmationCode: result.confirmationCode,
      totalAmount: result.totalAmount,
      currency: result.currency || 'EUR',
      cancellationUrl: result.cancellationUrl,
    };
  },

  async cancelBooking(bookingId: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.functions.invoke('hotel-booking', {
      body: {
        action: 'cancel_booking',
        provider: 'impala',
        bookingId,
      },
    });

    if (error) return { success: false, error: error.message };
    return { success: data?.success ?? true };
  },

  async getBookingStatus(providerBookingId: string) {
    const { data } = await supabase.functions.invoke('hotel-booking', {
      body: {
        action: 'get_status',
        provider: 'impala',
        providerBookingId,
      },
    });

    return data?.status || 'pending';
  },
};
