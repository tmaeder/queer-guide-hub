import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get the user from the request
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bookingData = await req.json();
    console.log('Creating booking:', bookingData);

    // Generate booking reference
    const bookingReference = `${bookingData.bookingType.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Prepare booking data based on type
    let insertData: any = {
      user_id: user.id,
      booking_type: bookingData.bookingType,
      booking_reference: bookingReference,
      total_price: bookingData.totalPrice,
      currency: bookingData.currency || 'USD',
      traveler_details: bookingData.travelerDetails,
      status: 'confirmed'
    };

    if (bookingData.bookingType === 'flight') {
      insertData = {
        ...insertData,
        flight_data: bookingData.flightData,
        departure_airport: bookingData.departureAirport,
        arrival_airport: bookingData.arrivalAirport,
        departure_date: bookingData.departureDate,
        return_date: bookingData.returnDate,
        passengers: bookingData.passengers
      };
    } else if (bookingData.bookingType === 'hotel') {
      insertData = {
        ...insertData,
        hotel_data: bookingData.hotelData,
        hotel_name: bookingData.hotelName,
        hotel_location: bookingData.hotelLocation,
        check_in_date: bookingData.checkInDate,
        check_out_date: bookingData.checkOutDate,
        rooms: bookingData.rooms,
        guests: bookingData.guests
      };
    }

    // Insert booking into database
    const { data: booking, error } = await supabaseClient
      .from('bookings')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to create booking', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Booking created successfully:', booking);

    return new Response(
      JSON.stringify({ 
        success: true, 
        booking,
        message: 'Booking created successfully'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Create booking error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});