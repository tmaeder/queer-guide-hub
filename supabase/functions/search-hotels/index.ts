import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from '../_shared/supabase-client.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let location: string, checkInDate: string | undefined, checkOutDate: string | undefined,
        rooms: number, guests: number;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      location = url.searchParams.get('location') || '';
      checkInDate = url.searchParams.get('checkInDate') || undefined;
      checkOutDate = url.searchParams.get('checkOutDate') || undefined;
      rooms = parseInt(url.searchParams.get('rooms') || '1');
      guests = parseInt(url.searchParams.get('guests') || '2');
    } else {
      const body = await req.json();
      location = body.location || '';
      checkInDate = body.checkInDate;
      checkOutDate = body.checkOutDate;
      rooms = body.rooms || 1;
      guests = body.guests || 2;
    }

    if (!location) {
      return new Response(
        JSON.stringify({ error: 'location is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build Booking.com search URL
    // Note: Once a Booking.com AID is configured, add &aid=YOUR_AID to the URL
    const bookingUrl = new URL('https://www.booking.com/searchresults.html');
    bookingUrl.searchParams.set('ss', location);
    if (checkInDate) bookingUrl.searchParams.set('checkin', checkInDate);
    if (checkOutDate) bookingUrl.searchParams.set('checkout', checkOutDate);
    bookingUrl.searchParams.set('group_adults', String(guests));
    bookingUrl.searchParams.set('no_rooms', String(rooms));

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Hotel search available via Booking.com',
        bookingUrl: bookingUrl.toString(),
        searchParams: { location, checkInDate, checkOutDate, rooms, guests }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Search hotels error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
