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
    const { 
      origin,
      destination,
      departureDate,
      returnDate,
      passengers,
      class: cabinClass = 'economy'
    } = await req.json();

    console.log('Searching flights:', { origin, destination, departureDate, returnDate, passengers });

    const apiToken = Deno.env.get('TRAVELPAYOUTS_API_TOKEN');
    if (!apiToken) {
      console.error('TRAVELPAYOUTS_API_TOKEN not found');
      return new Response(
        JSON.stringify({ error: 'API token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Search for flights using Travelpayouts API
    const searchUrl = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
    searchUrl.searchParams.append('origin', origin);
    searchUrl.searchParams.append('destination', destination);
    searchUrl.searchParams.append('departure_at', departureDate);
    if (returnDate) {
      searchUrl.searchParams.append('return_at', returnDate);
    }
    searchUrl.searchParams.append('unique', 'false');
    searchUrl.searchParams.append('sorting', 'price');
    searchUrl.searchParams.append('limit', '20');
    searchUrl.searchParams.append('token', apiToken);

    console.log('Making request to Travelpayouts API:', searchUrl.toString());

    const response = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      console.error('Travelpayouts API error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to search flights', details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('Travelpayouts API response:', data);

    // Transform the data to a more usable format
    const flights = data.data?.map((flight: any) => ({
      id: `${flight.origin}-${flight.destination}-${flight.departure_at}`,
      origin: flight.origin,
      destination: flight.destination,
      departureDate: flight.departure_at,
      returnDate: flight.return_at,
      price: flight.price,
      currency: data.currency,
      airline: flight.airline,
      flightNumber: flight.flight_number,
      duration: flight.duration,
      stops: flight.transfers || 0,
      link: flight.link
    })) || [];

    return new Response(
      JSON.stringify({ 
        success: true, 
        flights,
        currency: data.currency,
        searchParams: { origin, destination, departureDate, returnDate, passengers }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Search flights error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});