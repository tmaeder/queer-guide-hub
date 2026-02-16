import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MARKER = '452012';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let origin: string, destination: string, departureDate: string,
        returnDate: string | undefined, passengers: number, cabinClass: string;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      origin = url.searchParams.get('origin') || '';
      destination = url.searchParams.get('destination') || '';
      departureDate = url.searchParams.get('departureDate') || '';
      returnDate = url.searchParams.get('returnDate') || undefined;
      passengers = parseInt(url.searchParams.get('passengers') || '1');
      cabinClass = url.searchParams.get('class') || 'economy';
    } else {
      const body = await req.json();
      origin = body.origin || '';
      destination = body.destination || '';
      departureDate = body.departureDate || '';
      returnDate = body.returnDate;
      passengers = body.passengers || 1;
      cabinClass = body.class || 'economy';
    }

    if (!origin || !destination) {
      return new Response(
        JSON.stringify({ error: 'origin and destination are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Searching flights:', { origin, destination, departureDate, returnDate, passengers });

    const apiToken = Deno.env.get('TRAVELPAYOUTS_API_TOKEN');
    if (!apiToken) {
      return new Response(
        JSON.stringify({ error: 'API token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchUrl = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
    searchUrl.searchParams.append('origin', origin);
    searchUrl.searchParams.append('destination', destination);
    if (departureDate) searchUrl.searchParams.append('departure_at', departureDate);
    if (returnDate) searchUrl.searchParams.append('return_at', returnDate);
    searchUrl.searchParams.append('unique', 'false');
    searchUrl.searchParams.append('sorting', 'price');
    searchUrl.searchParams.append('limit', '20');
    searchUrl.searchParams.append('token', apiToken);

    const response = await fetch(searchUrl.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Travelpayouts API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to search flights', details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    const flights = (data.data || []).map((flight: any) => {
      const affiliateUrl = new URL('https://search.aviasales.com/flights/');
      affiliateUrl.searchParams.set('origin_iata', flight.origin);
      affiliateUrl.searchParams.set('destination_iata', flight.destination);
      if (flight.departure_at) affiliateUrl.searchParams.set('depart_date', flight.departure_at.split('T')[0]);
      if (flight.return_at) affiliateUrl.searchParams.set('return_date', flight.return_at.split('T')[0]);
      affiliateUrl.searchParams.set('adults', String(passengers));
      affiliateUrl.searchParams.set('marker', MARKER);

      return {
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
        link: affiliateUrl.toString(),
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        flights,
        currency: data.currency || 'EUR',
        searchParams: { origin, destination, departureDate, returnDate, passengers }
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=1800',
        }
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
