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
    // Use service role for secure booking creation with encryption
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false
        }
      }
    );

    // Verify user authentication from the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create anon client to verify user token
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const {
      data: { user },
      error: userError,
    } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bookingData = await req.json();
    console.log('Creating secure booking for user:', user.id);

    // Enhanced booking reference with additional entropy
    const bookingReference = `${bookingData.bookingType.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Log booking creation attempt
    await supabaseClient.rpc('log_enhanced_security_event', {
      p_event_type: 'BOOKING_CREATION_ATTEMPTED',
      p_user_id: user.id,
      p_metadata: {
        booking_type: bookingData.bookingType,
        booking_reference: bookingReference,
        total_price: bookingData.totalPrice,
        timestamp: new Date().toISOString()
      },
      p_severity: 'medium'
    });

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

    console.log('Secure booking created successfully:', { 
      id: booking.id, 
      reference: booking.booking_reference,
      encrypted: booking.encryption_key_id !== null 
    });

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