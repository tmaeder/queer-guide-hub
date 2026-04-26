import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsResponse, errorResponse, getServiceClient, jsonResponse } from "../_shared/supabase-client.ts";

/**
 * Hotel Booking Edge Function
 *
 * Creates a booking record and (when in-app providers are available)
 * processes the actual booking via provider API.
 *
 * Currently: Creates a pending booking record for affiliate tracking.
 * Future: Will call Impala/Booking.com Demand API for in-app booking.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Authorization required', 401, req);
    }

    const supabase = getServiceClient();
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return errorResponse('Invalid authorization', 401, req);
    }

    const body = await req.json();
    const { hotelId, provider, checkIn, checkOut, guestName, guestEmail, specialRequests, tripId } = body;

    if (!provider || !guestName) {
      return errorResponse('Provider and guest name required', 400, req);
    }

    // Create booking record
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        user_id: userData.user.id,
        trip_id: tripId || null,
        provider,
        booking_type: 'hotel',
        status: 'pending',
        check_in: checkIn || null,
        check_out: checkOut || null,
        guest_name: guestName,
        provider_data: {
          hotelId,
          guestEmail,
          specialRequests,
        },
      })
      .select('id')
      .single();

    if (bookingError) {
      console.error('Booking insert error:', bookingError);
      return errorResponse('Failed to create booking', 500, req);
    }

    // If trip specified, auto-create reservation link
    if (tripId) {
      await supabase.from('trip_reservations').insert({
        trip_id: tripId,
        type: 'hotel',
        title: `Hotel booking via ${provider}`,
        provider,
        booking_id: booking.id,
        auto_created: true,
        status: 'pending',
      });
    }

    // Send confirmation email (fire-and-forget)
    supabase.functions.invoke('booking-confirmation', {
      body: { bookingId: booking.id },
    }).catch((e: unknown) => console.warn('Confirmation email failed:', e));

    return jsonResponse({
      success: true,
      bookingId: booking.id,
      status: 'pending',
    }, 200, req);

  } catch (error) {
    console.error('Hotel booking error:', error);
    return errorResponse('Internal server error', 500, req);
  }
});
